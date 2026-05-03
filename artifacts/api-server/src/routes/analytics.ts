import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, ordersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * GET /api/stores/:slug/analytics
 * Returns sales metrics for the last 30 days.
 * Requires seller authentication and ownership.
 */
router.get("/stores/:slug/analytics", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [store] = await db.select().from(storesTable).where(eq(storesTable.slug, raw));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  if (store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // ── Fetch all orders for this store ───────────────────────────────────────
  const allOrders = await db
    .select({
      status: ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      amount: ordersTable.amount,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, store.id));

  // ── Aggregate totals ───────────────────────────────────────────────────────
  const totalOrders = allOrders.length;

  const paidOrders = allOrders.filter((o) => o.paymentStatus === "paid");

  const totalRevenue = paidOrders.reduce(
    (sum, o) => sum + (parseFloat(o.amount ?? "0") || 0),
    0,
  );

  const avgOrderValue =
    paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

  // ── Status breakdown ───────────────────────────────────────────────────────
  const statusBreakdown = {
    pending: allOrders.filter((o) => o.status === "pending").length,
    confirmed: allOrders.filter((o) => o.status === "confirmed").length,
    completed: allOrders.filter((o) => o.status === "completed").length,
    cancelled: allOrders.filter((o) => o.status === "cancelled").length,
  };

  // ── Week-over-week ─────────────────────────────────────────────────────────
  const now = new Date();
  // Monday as start of week
  const dayOfWeek = now.getDay(); // 0=Sun
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  const thisWeekRevenue = paidOrders
    .filter((o) => o.createdAt && new Date(o.createdAt) >= startOfThisWeek)
    .reduce((sum, o) => sum + (parseFloat(o.amount ?? "0") || 0), 0);

  const lastWeekRevenue = paidOrders
    .filter((o) => {
      const d = o.createdAt ? new Date(o.createdAt) : null;
      return d && d >= startOfLastWeek && d < startOfThisWeek;
    })
    .reduce((sum, o) => sum + (parseFloat(o.amount ?? "0") || 0), 0);

  // ── Revenue by day — last 30 days ──────────────────────────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // Pre-fill every day with zeros so there are no gaps in the chart
  const dayMap: Record<string, { revenue: number; orders: number }> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(thirtyDaysAgo.getDate() + i);
    dayMap[d.toISOString().slice(0, 10)] = { revenue: 0, orders: 0 };
  }

  for (const o of paidOrders) {
    if (!o.createdAt) continue;
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    if (dayMap[key]) {
      dayMap[key].revenue += parseFloat(o.amount ?? "0") || 0;
      dayMap[key].orders += 1;
    }
  }

  const revenueByDay = Object.entries(dayMap).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
  }));

  res.json({
    currency: store.currency || "GHS",
    totalOrders,
    paidOrders: paidOrders.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    thisWeekRevenue: Math.round(thisWeekRevenue * 100) / 100,
    lastWeekRevenue: Math.round(lastWeekRevenue * 100) / 100,
    statusBreakdown,
    revenueByDay,
  });
});

export default router;
