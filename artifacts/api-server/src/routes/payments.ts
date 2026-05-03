import crypto from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { eq, and, lt, isNull, isNotNull } from "drizzle-orm";
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
  generateDeliveryCode,
  parseTotalFromSummary,
  calcPlatformFee,
  calcTotalCharged,
  calcVendorPayout,
  PLATFORM_FEE_PCT,
} from "../lib/paystack";

const router: IRouter = Router();

function publicBaseUrl(req: Request): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host") ?? "localhost"}`
  );
}

// ─── Telegram helper ──────────────────────────────────────────────────────────
async function sendTelegramMsg(botToken: string, chatId: number | string, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  } catch { /* non-critical */ }
}

// ─── List banks ───────────────────────────────────────────────────────────────
router.get("/payments/banks", requireAuth, async (req, res): Promise<void> => {
  try {
    const currency = (req.query.currency as string) || "GHS";
    const banks = await listBanks(currency);
    res.json(banks);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to load banks" });
  }
});

// ─── Set payout recipient ─────────────────────────────────────────────────────
router.post("/stores/:slug/payout-recipient", requireAuth, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.slug, slug));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { type, accountNumber, bankCode, accountName } = req.body as {
    type?: "mobile_money" | "ghipss" | "nuban";
    accountNumber?: string;
    bankCode?: string;
    accountName?: string;
  };
  if (!type || !accountNumber || !bankCode || !accountName) {
    res.status(400).json({ error: "type, accountNumber, bankCode, and accountName are required" });
    return;
  }
  try {
    const recipient = await createRecipient({
      type, name: accountName, accountNumber, bankCode, currency: store.currency || "GHS",
    });
    const [updated] = await db.update(storesTable).set({
      paystackBankCode: bankCode,
      paystackAccountNumber: accountNumber,
      paystackAccountName: accountName,
      paystackRecipientCode: recipient.recipient_code,
    }).where(eq(storesTable.id, store.id)).returning();
    res.json({
      bankCode: updated.paystackBankCode,
      accountNumber: updated.paystackAccountNumber,
      accountName: updated.paystackAccountName,
      recipientCode: updated.paystackRecipientCode,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to create recipient" });
  }
});

// ─── Init payment ─────────────────────────────────────────────────────────────
// Public — called by the Telegram bot after collecting the buyer's phone.
// Total charged = product + delivery + 1% platform fee.
router.post("/payments/init", async (req, res): Promise<void> => {
  const { orderId, email } = req.body as { orderId?: number; email?: string };
  if (!orderId || typeof orderId !== "number") {
    res.status(400).json({ error: "orderId is required" });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.paymentStatus === "paid") { res.status(409).json({ error: "Order already paid" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const currency = store.currency || "GHS";

  // Product amount
  let productAmount = order.amount ? parseFloat(order.amount as unknown as string) : NaN;
  if (!Number.isFinite(productAmount) || productAmount <= 0) {
    const parsed = parseTotalFromSummary(order.summary, currency);
    if (parsed && parsed > 0) productAmount = parsed;
  }
  if (!Number.isFinite(productAmount) || productAmount <= 0) {
    res.status(400).json({ error: "Could not determine order amount from summary." });
    return;
  }

  // Delivery fee from store setting
  const deliveryFee = parseFloat((store.deliveryFee ?? "0") as unknown as string) || 0;
  const { platformFee, totalCharged } = calcTotalCharged(productAmount, deliveryFee);

  const reference = order.paymentReference || generatePaymentReference(order.id);
  const buyerEmail = email && /\S+@\S+\.\S+/.test(email)
    ? email
    : `order-${order.id}@quickshop.app`;

  try {
    const init = await initTransaction({
      amount: totalCharged,
      email: buyerEmail,
      reference,
      currency,
      callbackUrl: `${publicBaseUrl(req)}/pay/callback?orderId=${order.id}`,
      metadata: { orderId: order.id, storeId: store.id, storeSlug: store.slug, productAmount, deliveryFee, platformFee },
    });

    await db.update(ordersTable).set({
      amount: productAmount.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      platformFee: platformFee.toFixed(2),
      totalCharged: totalCharged.toFixed(2),
      currency,
      paymentReference: reference,
      paymentStatus: "pending",
    }).where(eq(ordersTable.id, order.id));

    res.json({ authorizationUrl: init.authorization_url, reference: init.reference, totalCharged, currency });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to init payment" });
  }
});

// ─── Verify payment (buyer callback) ─────────────────────────────────────────
router.get("/payments/verify/:reference", async (req, res): Promise<void> => {
  const reference = String(req.params.reference);
  try {
    const result = await verifyTransaction(reference);
    if (result.status === "success") {
      await markOrderPaid(reference, new Date(result.paid_at || Date.now()));
    }
    res.json({ status: result.status, reference: result.reference });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Verification failed" });
  }
});

// ─── Internal: mark order paid + generate delivery code ───────────────────────
export async function markOrderPaid(reference: string, paidAt: Date): Promise<void> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.paymentReference, reference));
  if (!order || order.paymentStatus === "paid") return; // idempotent

  const deliveryCode = generateDeliveryCode();

  await db.update(ordersTable).set({
    paymentStatus: "paid",
    paidAt,
    deliveryCode,
    status: order.status === "pending" ? "confirmed" : order.status,
  }).where(eq(ordersTable.id, order.id));

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store) return;

  const cur = order.currency ?? store.currency ?? "GHS";
  const ref = `QS-${String(order.id).padStart(4, "0")}`;

  // Notify buyer with their delivery code
  if (order.customerTelegramChatId && store.telegramBotToken) {
    await sendTelegramMsg(
      store.telegramBotToken,
      order.customerTelegramChatId,
      `✅ Payment confirmed for *${ref}*!\n\n🔐 Your delivery code is:\n\n*${deliveryCode}*\n\n⚠️ *Only share this code when your item is physically in your hands.* The seller enters it to release your payment. Keep it safe until delivery.`,
    );
  }

  // Notify seller
  if (store.sellerTelegramChatId && store.telegramBotToken) {
    const amt = order.totalCharged ?? order.amount ?? "?";
    await sendTelegramMsg(
      store.telegramBotToken,
      store.sellerTelegramChatId,
      `💰 *Payment received for ${ref}*\n\nTotal paid: ${cur} ${amt}\nFunds are in escrow. Ship the order, then ask the buyer for their 6-digit delivery code to release payment.`,
    );
  }
}

// ─── Paystack webhook ─────────────────────────────────────────────────────────
router.post("/webhooks/paystack", async (req, res): Promise<void> => {
  const signature = req.header("x-paystack-signature");
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  const event = req.body as {
    event?: string;
    data?: { reference?: string; status?: string; paid_at?: string };
  };
  try {
    if (event.event === "charge.success" && event.data?.reference) {
      await markOrderPaid(event.data.reference, new Date(event.data.paid_at || Date.now()));
    } else if (event.event === "transfer.success" && event.data?.reference) {
      await db.update(ordersTable).set({ payoutStatus: "success" })
        .where(eq(ordersTable.payoutReference, event.data.reference));
    } else if (event.event === "transfer.failed" && event.data?.reference) {
      await db.update(ordersTable).set({ payoutStatus: "failed", releasedAt: null })
        .where(eq(ordersTable.payoutReference, event.data.reference));
    }
  } catch (err) {
    console.error("Paystack webhook error:", err);
  }
  res.json({ received: true });
});

// ─── Mark shipped ─────────────────────────────────────────────────────────────
router.post("/orders/:id/ship", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (order.paymentStatus !== "paid") {
    res.status(400).json({ error: "Order has not been paid yet" }); return;
  }

  const { photoUrl } = req.body as { photoUrl?: string };
  // Auto-release fires 48 hours after shipping
  const autoReleaseAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const [updated] = await db.update(ordersTable).set({
    shippedAt: new Date(),
    shippedPhotoUrl: photoUrl ?? null,
    autoReleaseAt,
  }).where(eq(ordersTable.id, id)).returning();

  // Notify buyer
  if (order.customerTelegramChatId && store.telegramBotToken) {
    const ref = `QS-${String(order.id).padStart(4, "0")}`;
    await sendTelegramMsg(store.telegramBotToken, order.customerTelegramChatId,
      `📦 Your order *${ref}* has been shipped!\n\nWhen it arrives, give the delivery person your *6-digit code* to confirm receipt and release payment.\n\n⏱️ If you're unavailable for 48 hours, the delivery fee will be non-refundable and the item will return to the seller.`,
    );
  }
  res.json(updated);
});

// ─── Verify delivery code → release escrow ────────────────────────────────────
router.post("/orders/:id/verify-delivery", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (order.paymentStatus !== "paid") {
    res.status(400).json({ error: "Order has not been paid" }); return;
  }
  if (order.releasedAt) {
    res.status(409).json({ error: "Funds already released" }); return;
  }
  if (!store.paystackRecipientCode) {
    res.status(400).json({ error: "Add payout details in Store Settings before releasing funds." }); return;
  }

  const { code } = req.body as { code?: string };

  // If deliveryCode was never generated (order paid before this feature was deployed),
  // log and fall back to a manual release so existing orders aren't permanently stuck.
  // Legacy orders pre-date the shipping flow, so we don't require shippedAt here.
  if (!order.deliveryCode) {
    try {
      const result = await releaseFundsToVendor(order, store, "manual");
      res.json(result);
    } catch (err) {
      console.error("verify-delivery fallback release error:", err);
      res.status(502).json({ error: err instanceof Error ? err.message : "Release failed" });
    }
    return;
  }

  // Modern flow: the seller MUST mark the order as shipped before releasing funds.
  // Without this guard the buyer never gets the "shipped" notification and the 48h
  // auto-release safety timer is never set — meaning a buyer who never receives
  // the item has no recourse and we have no audit trail of when it shipped.
  if (!order.shippedAt) {
    res.status(400).json({
      error: "Mark this order as shipped before releasing funds. The buyer must be notified that the item is on its way.",
    });
    return;
  }

  if (!code || code.trim() !== order.deliveryCode) {
    res.status(400).json({ error: "Incorrect delivery code. Ask the buyer for their 6-digit code." });
    return;
  }

  // Code correct → release escrow to vendor
  try {
    const result = await releaseFundsToVendor(order, store, "delivery_code");
    res.json(result);
  } catch (err) {
    console.error("verify-delivery release error:", err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Release failed" });
  }
});

// ─── Refund buyer (vendor ghost) ──────────────────────────────────────────────
// Seller didn't ship. Buyer gets full refund. Platform fee deducted from vendor deposit.
router.post("/orders/:id/refund", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (order.paymentStatus !== "paid") {
    res.status(400).json({ error: "Order has not been paid" }); return;
  }
  if (order.refundedAt) {
    res.status(409).json({ error: "Already refunded" }); return;
  }

  try {
    // Refund buyer the full amount via Paystack
    const refundRes = await fetch(`https://api.paystack.co/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: order.paymentReference,
        // Full amount back to buyer
        amount: order.totalCharged ? Math.round(parseFloat(order.totalCharged as unknown as string) * 100) : undefined,
      }),
    });
    const refundData = (await refundRes.json()) as { status?: boolean; data?: { reference?: string } };
    if (!refundData.status) throw new Error("Paystack refund failed");

    const platformFee = order.platformFee
      ? parseFloat(order.platformFee as unknown as string)
      : calcPlatformFee(parseFloat((order.amount ?? "0") as unknown as string));

    // Deduct platform fee from vendor's deposit
    const currentDeposit = parseFloat((store.vendorDeposit ?? "0") as unknown as string);
    const currentDebt = parseFloat((store.vendorDebt ?? "0") as unknown as string);
    const newDeposit = Math.max(0, currentDeposit - platformFee);
    const additionalDebt = platformFee > currentDeposit ? platformFee - currentDeposit : 0;

    await db.update(storesTable).set({
      vendorDeposit: newDeposit.toFixed(2),
      vendorDebt: (currentDebt + additionalDebt).toFixed(2),
    }).where(eq(storesTable.id, store.id));

    const [updated] = await db.update(ordersTable).set({
      paymentStatus: "refunded",
      refundedAt: new Date(),
      refundReference: refundData.data?.reference ?? null,
      status: "cancelled",
    }).where(eq(ordersTable.id, order.id)).returning();

    // Notify buyer
    if (order.customerTelegramChatId && store.telegramBotToken) {
      const ref = `QS-${String(order.id).padStart(4, "0")}`;
      await sendTelegramMsg(store.telegramBotToken, order.customerTelegramChatId,
        `↩️ Your order *${ref}* has been cancelled and a full refund has been initiated. It may take 1-5 business days to reflect in your account.`,
      );
    }

    res.json({ ...updated, refundedAmount: order.totalCharged, platformFeeDeducted: platformFee });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Refund failed" });
  }
});

// ─── 48h auto-release cron ────────────────────────────────────────────────────
// Hit this endpoint every hour (Railway cron, external scheduler, etc.).
// Buyer ghosts: refund product price to buyer, pay delivery fee to vendor.
router.post("/cron/auto-release", async (req, res): Promise<void> => {
  // Simple shared secret so only your cron can trigger it
  const secret = req.header("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }

  const now = new Date();
  // Find shipped orders whose 48h window has passed with no delivery code entered
  const overdueOrders = await db.select().from(ordersTable).where(
    and(
      eq(ordersTable.paymentStatus, "paid"),
      isNotNull(ordersTable.shippedAt),
      isNull(ordersTable.deliveryCodeVerifiedAt),
      isNull(ordersTable.releasedAt),
      isNull(ordersTable.refundedAt),
      lt(ordersTable.autoReleaseAt, now),
    )
  );

  const results: { orderId: number; result: string }[] = [];
  for (const order of overdueOrders) {
    try {
      const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
      if (!store) continue;
      await handleBuyerGhost(order, store);
      results.push({ orderId: order.id, result: "processed" });
    } catch (err) {
      results.push({ orderId: order.id, result: `error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  res.json({ processed: results.length, results });
});

// ─── Internal: buyer ghosted — partial refund ──────────────────────────────────
// Buyer paid but was unavailable for 48h after shipping.
// → Refund product price to buyer (delivery fee + platform fee non-refundable)
// → Transfer delivery fee to vendor
async function handleBuyerGhost(
  order: typeof ordersTable.$inferSelect,
  store: typeof storesTable.$inferSelect,
): Promise<void> {
  const productAmount = parseFloat((order.amount ?? "0") as unknown as string);
  const deliveryFee = parseFloat((order.deliveryFee ?? "0") as unknown as string);
  const platformFee = parseFloat((order.platformFee ?? "0") as unknown as string);
  const currency = order.currency ?? store.currency ?? "GHS";
  const ref = `QS-${String(order.id).padStart(4, "0")}`;

  // 1. Refund buyer: product price only (delivery + platform fee non-refundable)
  if (productAmount > 0) {
    await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: order.paymentReference,
        amount: Math.round(productAmount * 100), // pesewas
      }),
    }).catch(console.error);
  }

  // 2. Transfer delivery fee to vendor (compensates their courier cost)
  let payoutRef: string | null = null;
  if (deliveryFee > 0 && store.paystackRecipientCode) {
    try {
      const transfer = await initiateTransfer({
        amount: deliveryFee,
        recipientCode: store.paystackRecipientCode,
        reason: `Delivery fee compensation — ${ref} (buyer unavailable)`,
        reference: `qs-delivery-${order.id}-${Date.now()}`,
      });
      payoutRef = transfer.reference;
    } catch { /* log but don't block */ }
  }

  // 3. Update order
  await db.update(ordersTable).set({
    paymentStatus: "refunded",
    refundedAt: new Date(),
    releasedAt: payoutRef ? new Date() : null,
    payoutReference: payoutRef,
    payoutStatus: payoutRef ? "pending" : null,
    status: "cancelled",
  }).where(eq(ordersTable.id, order.id));

  // 4. Notify buyer
  if (order.customerTelegramChatId && store.telegramBotToken) {
    await sendTelegramMsg(store.telegramBotToken, order.customerTelegramChatId,
      `↩️ Order *${ref}*: You were unavailable at delivery after 48 hours.\n\n*${currency} ${productAmount.toFixed(2)}* (item price) has been refunded. The delivery fee of *${currency} ${deliveryFee.toFixed(2)}* is non-refundable as the courier already made the trip.\n\nRefund may take 1-5 business days.`,
    );
  }

  // 5. Notify seller
  if (store.sellerTelegramChatId && store.telegramBotToken) {
    await sendTelegramMsg(store.telegramBotToken, store.sellerTelegramChatId,
      `🔔 Order *${ref}*: Buyer was unavailable for 48 hours after shipping.\n\nItem price refunded to buyer. Your delivery fee of *${currency} ${deliveryFee.toFixed(2)}* has been transferred to your account.`,
    );
  }
}

// ─── Internal: release escrow to vendor (normal flow) ────────────────────────
async function releaseFundsToVendor(
  order: typeof ordersTable.$inferSelect,
  store: typeof storesTable.$inferSelect,
  trigger: "delivery_code" | "manual",
): Promise<Record<string, unknown>> {
  if (!store.paystackRecipientCode) {
    throw new Error("Add payout details in Store Settings before releasing funds.");
  }

  const productAmount = parseFloat((order.amount ?? "0") as unknown as string);
  const deliveryFee = parseFloat((order.deliveryFee ?? "0") as unknown as string);
  const vendorPayout = calcVendorPayout(productAmount, deliveryFee);

  // Deduct any outstanding vendor debt from this payout
  const currentDebt = parseFloat((store.vendorDebt ?? "0") as unknown as string);
  const deductDebt = Math.min(currentDebt, vendorPayout);
  const finalPayout = Math.round((vendorPayout - deductDebt) * 100) / 100;

  const transferRef = `qs-payout-${order.id}-${Date.now()}`;
  const transfer = await initiateTransfer({
    amount: finalPayout,
    recipientCode: store.paystackRecipientCode,
    reason: `QuickShop order QS-${String(order.id).padStart(4, "0")}${deductDebt > 0 ? ` (debt deducted: ${store.currency || "GHS"} ${deductDebt.toFixed(2)})` : ""}`,
    reference: transferRef,
  });

  // Generate a one-time review token so we can ask the buyer for feedback
  // without forcing them to authenticate.
  const reviewToken = crypto.randomBytes(16).toString("hex");

  const now = new Date();
  await db.update(ordersTable).set({
    releasedAt: now,
    receivedAt: order.receivedAt ?? now,
    deliveryCodeVerifiedAt: trigger === "delivery_code" ? now : order.deliveryCodeVerifiedAt,
    payoutReference: transfer.reference,
    payoutStatus: transfer.status === "success" ? "success" : "pending",
    status: "completed",
    reviewToken,
  }).where(eq(ordersTable.id, order.id));

  // Clear vendor debt if we deducted some
  if (deductDebt > 0) {
    await db.update(storesTable).set({
      vendorDebt: (currentDebt - deductDebt).toFixed(2),
    }).where(eq(storesTable.id, store.id));
  }

  const cur = order.currency ?? store.currency ?? "GHS";
  const ref = `QS-${String(order.id).padStart(4, "0")}`;

  // Notify buyer with a review-prompt link
  if (order.customerTelegramChatId && store.telegramBotToken) {
    const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const reviewLine = baseUrl
      ? `\n\n⭐ How was your experience? Rate *${store.name}* — it takes 10 seconds:\n${baseUrl}/review/${order.id}?token=${reviewToken}`
      : "";
    await sendTelegramMsg(store.telegramBotToken, order.customerTelegramChatId,
      `🎉 Order *${ref}* complete! Your payment has been released to *${store.name}*. Thank you for shopping! 😊${reviewLine}`,
    );
  }

  return {
    orderId: order.id,
    vendorPayout: finalPayout,
    debtDeducted: deductDebt,
    platformFee: order.platformFee,
    currency: cur,
    PLATFORM_FEE_PCT,
  };
}

// ─── Manual release (fallback, seller-triggered) ──────────────────────────────
router.post("/orders/:id/release", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (order.paymentStatus !== "paid") { res.status(400).json({ error: "Order has not been paid" }); return; }
  if (order.releasedAt) { res.status(409).json({ error: "Funds already released" }); return; }

  // Modern orders (with deliveryCode) must be shipped before releasing funds.
  // Legacy orders without a deliveryCode skip this check so they aren't stuck.
  if (order.deliveryCode && !order.shippedAt) {
    res.status(400).json({
      error: "Mark this order as shipped before releasing funds.",
    });
    return;
  }

  try {
    const result = await releaseFundsToVendor(order, store, "manual");
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Transfer failed" });
  }
});

export default router;
