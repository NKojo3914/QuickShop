import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, ordersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

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
  if (!status || !["pending", "confirmed", "completed"].includes(status)) {
    res.status(400).json({ error: "Status must be one of: pending, confirmed, completed" });
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

  res.json(order);
});

export default router;
