import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ordersTable, storesTable, reviewsTable } from "@workspace/db";

const router: IRouter = Router();

// ─── POST /api/reviews ─────────────────────────────────────────────────────────
// Buyer submits a review using the one-time token sent in the delivery-confirmed
// Telegram message. No login required — the token is the auth.
router.post("/reviews", async (req, res): Promise<void> => {
  try {
    const { orderId, token, rating, body } = req.body as {
      orderId?: number;
      token?: string;
      rating?: number;
      body?: string;
    };

    if (!orderId || !token) {
      res.status(400).json({ error: "Missing order or token" });
      return;
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating must be a number from 1 to 5" });
      return;
    }

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (!order.reviewToken || order.reviewToken !== token) {
      res.status(403).json({ error: "Invalid or expired review link" });
      return;
    }

    // Prevent duplicate reviews (also enforced by UNIQUE index — this is the
    // friendly error path)
    const [existing] = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(eq(reviewsTable.orderId, order.id));
    if (existing) {
      res.status(409).json({ error: "You've already reviewed this order. Thank you!" });
      return;
    }

    const trimmedBody = (body ?? "").trim().slice(0, 1000);

    const [review] = await db
      .insert(reviewsTable)
      .values({
        orderId: order.id,
        storeId: order.storeId,
        rating,
        body: trimmedBody || null,
        customerName: order.customerName ?? null,
      })
      .returning();

    // Burn the token so the same link can't submit twice
    await db.update(ordersTable).set({ reviewToken: null }).where(eq(ordersTable.id, order.id));

    res.status(201).json({ ok: true, review });
  } catch (err) {
    console.error("POST /reviews failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to submit review" });
  }
});

// ─── GET /api/orders/:id/review-context ────────────────────────────────────────
// Public endpoint that the review page calls on load to (1) verify the token,
// (2) get the store name + product summary so the page can render context,
// (3) detect already-submitted state.
router.get("/orders/:id/review-context", async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const token = String(req.query.token ?? "");
    if (isNaN(id) || !token) {
      res.status(400).json({ error: "Missing order or token" });
      return;
    }
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // If already reviewed (token consumed), tell the UI gracefully instead of 403
    const [existing] = await db
      .select({ id: reviewsTable.id, rating: reviewsTable.rating, body: reviewsTable.body })
      .from(reviewsTable)
      .where(eq(reviewsTable.orderId, order.id));

    if (!order.reviewToken || order.reviewToken !== token) {
      if (existing) {
        const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
        res.json({
          alreadyReviewed: true,
          existing,
          storeName: store?.name ?? null,
          storeSlug: store?.slug ?? null,
        });
        return;
      }
      res.status(403).json({ error: "Invalid or expired review link" });
      return;
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId));
    res.json({
      alreadyReviewed: false,
      orderId: order.id,
      orderRef: `QS-${String(order.id).padStart(4, "0")}`,
      summary: order.summary,
      customerName: order.customerName,
      storeName: store?.name ?? null,
      storeSlug: store?.slug ?? null,
    });
  } catch (err) {
    console.error("GET /review-context failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load review context" });
  }
});

// ─── GET /api/stores/:slug/reviews ─────────────────────────────────────────────
// Public — used by the storefront to show avg rating, count, and recent reviews.
router.get("/stores/:slug/reviews", async (req, res): Promise<void> => {
  try {
    const slug = String(req.params.slug);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.slug, slug));
    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }

    const reviews = await db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.storeId, store.id))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(50);

    const count = reviews.length;
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    res.json({
      count,
      average,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        customerName: r.customerName,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("GET /stores/:slug/reviews failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load reviews" });
  }
});

export default router;
