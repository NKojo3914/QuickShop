import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, ordersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  initTransaction,
  verifyTransaction,
  createRecipient,
  initiateTransfer,
  listBanks,
  verifyWebhookSignature,
  generatePaymentReference,
  parseTotalFromSummary,
  calcSplit,
  platformFeePct,
} from "../lib/paystack";

const router: IRouter = Router();

function publicBaseUrl(req: Request): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host") ?? "localhost"}`
  );
}

// ─── List banks (for the seller's payout-setup dropdown) ─────────────────────

router.get("/payments/banks", requireAuth, async (req, res): Promise<void> => {
  try {
    const currency = (req.query.currency as string) || "GHS";
    const banks = await listBanks(currency);
    res.json(banks);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load banks";
    res.status(502).json({ error: msg });
  }
});

// ─── Set / update a seller's payout recipient ────────────────────────────────

router.post("/stores/:slug/payout-recipient", requireAuth, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.slug, slug));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  if (store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this store" });
    return;
  }

  const { type, accountNumber, bankCode, accountName } = req.body as {
    type?: "mobile_money" | "ghipss" | "nuban";
    accountNumber?: string;
    bankCode?: string;
    accountName?: string;
  };
  if (!type || !accountNumber || !bankCode || !accountName) {
    res.status(400).json({
      error: "type, accountNumber, bankCode, and accountName are required",
    });
    return;
  }

  try {
    const recipient = await createRecipient({
      type,
      name: accountName,
      accountNumber,
      bankCode,
      currency: store.currency || "GHS",
    });

    const [updated] = await db
      .update(storesTable)
      .set({
        paystackBankCode: bankCode,
        paystackAccountNumber: accountNumber,
        paystackAccountName: accountName,
        paystackRecipientCode: recipient.recipient_code,
      })
      .where(eq(storesTable.id, store.id))
      .returning();

    res.json({
      bankCode: updated.paystackBankCode,
      accountNumber: updated.paystackAccountNumber,
      accountName: updated.paystackAccountName,
      recipientCode: updated.paystackRecipientCode,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create recipient";
    res.status(502).json({ error: msg });
  }
});

// ─── Init a payment for an order ─────────────────────────────────────────────
// Public endpoint — called by the buyer (often via the Telegram bot link, no
// auth cookie). We identify the order by its public ref token instead.

router.post("/payments/init", async (req, res): Promise<void> => {
  const { orderId, email } = req.body as { orderId?: number; email?: string };
  if (!orderId || typeof orderId !== "number") {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.paymentStatus === "paid") {
    res.status(409).json({ error: "Order already paid" });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const currency = order.currency || store.currency || "GHS";

  // Resolve the amount: prefer the order column, else parse the summary.
  let amount = order.amount ? parseFloat(order.amount as unknown as string) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    const parsed = parseTotalFromSummary(order.summary, currency);
    if (parsed && parsed > 0) amount = parsed;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({
      error:
        "Order amount could not be determined. Add a Total line to the summary or set the amount column.",
    });
    return;
  }

  // Reuse an existing reference if we already started checkout for this order
  // and it hasn't been paid yet — keeps the Paystack page bookmarkable.
  const reference = order.paymentReference || generatePaymentReference(order.id);

  // Buyer email is optional for us, but Paystack requires one — fall back to a
  // placeholder built from the order id.
  const buyerEmail =
    email && /\S+@\S+\.\S+/.test(email)
      ? email
      : `order-${order.id}@quickshop.app`;

  try {
    const init = await initTransaction({
      amount,
      email: buyerEmail,
      reference,
      currency,
      callbackUrl: `${publicBaseUrl(req)}/pay/callback?orderId=${order.id}`,
      metadata: {
        orderId: order.id,
        storeId: store.id,
        storeSlug: store.slug,
      },
    });

    await db
      .update(ordersTable)
      .set({
        amount: amount.toFixed(2),
        currency,
        paymentReference: reference,
        paymentStatus: "pending",
      })
      .where(eq(ordersTable.id, order.id));

    res.json({
      authorizationUrl: init.authorization_url,
      reference: init.reference,
      amount,
      currency,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to init payment";
    res.status(502).json({ error: msg });
  }
});

// ─── Verify a payment (used by the buyer's callback page) ────────────────────

router.get("/payments/verify/:reference", async (req, res): Promise<void> => {
  const reference = String(req.params.reference);
  try {
    const result = await verifyTransaction(reference);
    // If our webhook hasn't fired yet, reconcile the order here too.
    if (result.status === "success") {
      await markOrderPaid(reference, new Date(result.paid_at || Date.now()));
    }
    res.json({ status: result.status, reference: result.reference });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    res.status(502).json({ error: msg });
  }
});

async function markOrderPaid(reference: string, paidAt: Date): Promise<void> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.paymentReference, reference));
  if (!order) return;
  if (order.paymentStatus === "paid") return; // idempotent

  await db
    .update(ordersTable)
    .set({
      paymentStatus: "paid",
      paidAt,
      // Bump status from "pending" → "confirmed" so it appears in the seller's
      // confirmed-orders list. They still need to ship it.
      status: order.status === "pending" ? "confirmed" : order.status,
    })
    .where(eq(ordersTable.id, order.id));

  // Notify the seller on Telegram if they're registered.
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (store?.sellerTelegramChatId && store.telegramBotToken) {
    const ref = `QS-${String(order.id).padStart(4, "0")}`;
    const amt = order.amount ?? "?";
    const cur = order.currency ?? store.currency ?? "GHS";
    await fetch(`https://api.telegram.org/bot${store.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: store.sellerTelegramChatId,
        text: `💰 *Payment received for ${ref}*\n\nAmount: ${cur} ${amt}\nFunds are held in escrow. Ship the order, then mark it shipped in your dashboard so the buyer can release the funds.`,
        parse_mode: "Markdown",
      }),
    }).catch(() => {});
  }
}

// ─── Paystack webhook ────────────────────────────────────────────────────────
// Paystack POSTs JSON here for transaction.success, transfer.success, etc.
// We verify the HMAC-SHA512 signature against the raw request body, then
// process the event.

router.post("/webhooks/paystack", async (req, res): Promise<void> => {
  const signature = req.header("x-paystack-signature");
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: "Raw body unavailable" });
    return;
  }
  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as {
    event?: string;
    data?: { reference?: string; status?: string; paid_at?: string };
  };

  // Always 200 quickly — Paystack retries on non-2xx. Process inline since
  // each handler is fast (one DB write + one Telegram message).
  try {
    if (event.event === "charge.success" && event.data?.reference) {
      const paidAt = event.data.paid_at ? new Date(event.data.paid_at) : new Date();
      await markOrderPaid(event.data.reference, paidAt);
    } else if (event.event === "transfer.success" && event.data?.reference) {
      await db
        .update(ordersTable)
        .set({ payoutStatus: "success" })
        .where(eq(ordersTable.payoutReference, event.data.reference));
    } else if (event.event === "transfer.failed" && event.data?.reference) {
      await db
        .update(ordersTable)
        .set({ payoutStatus: "failed", releasedAt: null })
        .where(eq(ordersTable.payoutReference, event.data.reference));
    }
  } catch (err) {
    console.error("Paystack webhook handler error:", err);
  }
  res.json({ received: true });
});

// ─── Mark order shipped (seller) ─────────────────────────────────────────────

router.post("/orders/:id/ship", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this order" });
    return;
  }
  if (order.paymentStatus !== "paid") {
    res.status(400).json({ error: "Order has not been paid yet" });
    return;
  }

  const { photoUrl } = req.body as { photoUrl?: string };

  const [updated] = await db
    .update(ordersTable)
    .set({ shippedAt: new Date(), shippedPhotoUrl: photoUrl ?? null })
    .where(eq(ordersTable.id, id))
    .returning();

  // Notify the buyer that the order has shipped — gives them a window to
  // raise a dispute before auto-release.
  if (order.customerTelegramChatId && store.telegramBotToken) {
    const ref = `QS-${String(order.id).padStart(4, "0")}`;
    await fetch(`https://api.telegram.org/bot${store.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: order.customerTelegramChatId,
        text: `📦 Your order *${ref}* has been shipped!\n\nWhen you receive it, reply with *received* to release payment to the seller. Funds auto-release after 48 hours.`,
        parse_mode: "Markdown",
      }),
    }).catch(() => {});
  }

  res.json(updated);
});

// ─── Release escrow / payout to seller ───────────────────────────────────────
// Manual release — triggered when the seller clicks "Release Funds" or when
// the buyer confirms receipt via the Telegram bot. The 48 h auto-release is
// done by a separate cron (see TODO) but uses this same code path.

router.post("/orders/:id/release", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this order" });
    return;
  }
  if (order.paymentStatus !== "paid") {
    res.status(400).json({ error: "Order has not been paid yet" });
    return;
  }
  if (order.releasedAt) {
    res.status(409).json({ error: "Funds already released" });
    return;
  }
  if (!store.paystackRecipientCode) {
    res.status(400).json({
      error: "Add your bank/MoMo payout details in Store Settings before releasing funds.",
    });
    return;
  }

  const amount = parseFloat(order.amount as unknown as string);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Invalid order amount" });
    return;
  }
  const { fee, payout } = calcSplit(amount);

  try {
    const transferRef = `qs-payout-${order.id}-${Date.now()}`;
    const transfer = await initiateTransfer({
      amount: payout,
      recipientCode: store.paystackRecipientCode,
      reason: `QuickShop order QS-${String(order.id).padStart(4, "0")}`,
      reference: transferRef,
    });

    const [updated] = await db
      .update(ordersTable)
      .set({
        releasedAt: new Date(),
        receivedAt: order.receivedAt ?? new Date(),
        payoutReference: transfer.reference,
        payoutStatus: transfer.status === "success" ? "success" : "pending",
        platformFee: fee.toFixed(2),
        status: "completed",
      })
      .where(eq(ordersTable.id, order.id))
      .returning();

    res.json({ ...updated, fee, payout, platformFeePct: platformFeePct() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to initiate transfer";
    res.status(502).json({ error: msg });
  }
});

export default router;
