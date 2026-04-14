import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, ordersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) {
      // retry without markdown
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  } catch { /* silent */ }
}

const router: IRouter = Router();

router.get("/stores/:storeId/orders", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const storeId = parseInt(raw, 10);

  if (isNaN(storeId)) {
    res.status(400).json({ error: "Invalid store ID" });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(ordersTable.createdAt);

  res.json(orders.reverse());
});

router.patch("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const { status } = req.body as { status?: string };
  if (!status || !["pending", "confirmed", "completed", "cancelled"].includes(status)) {
    res.status(400).json({ error: "Status must be one of: pending, confirmed, completed, cancelled" });
    return;
  }

  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, existing.storeId));

  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this order" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({ status })
    .where(eq(ordersTable.id, id))
    .returning();

  // Notify buyer on Telegram when seller confirms or completes their order
  if (
    order.customerTelegramChatId &&
    store.telegramBotToken &&
    (status === "confirmed" || status === "completed" || status === "cancelled")
  ) {
    const ref = `QS-${String(order.id).padStart(4, "0")}`;
    const msg =
      status === "confirmed"
        ? `✅ Your order *${ref}* has been confirmed by *${store.name}*! They'll be in touch shortly to arrange delivery and payment. 🛍️`
        : status === "completed"
        ? `🎉 Your order *${ref}* is complete! Thank you for shopping with *${store.name}*. We hope to see you again! 😊`
        : `❌ Sorry, your order *${ref}* from *${store.name}* has been cancelled. Please contact the seller for more information.`;
    await sendTelegramMessage(store.telegramBotToken, order.customerTelegramChatId, msg);
  }

  res.json(order);
});

// POST /stores/:storeId/orders — log a WhatsApp order manually from the dashboard
router.post("/stores/:storeId/orders", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const storeId = parseInt(raw, 10);

  if (isNaN(storeId)) {
    res.status(400).json({ error: "Invalid store ID" });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  if (store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this store" });
    return;
  }

  const { customerName, customerPhone, summary } = req.body as {
    customerName?: string;
    customerPhone?: string;
    summary?: string;
  };

  if (!summary || !summary.trim()) {
    res.status(400).json({ error: "Order summary is required" });
    return;
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      storeId,
      customerName: customerName?.trim() || null,
      customerPhone: customerPhone?.trim() || null,
      summary: summary.trim(),
      status: "pending",
      source: "whatsapp",
    })
    .returning();

  res.status(201).json(order);
});

export default router;
