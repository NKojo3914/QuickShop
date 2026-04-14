import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, storesTable, productsTable } from "@workspace/db";
import {
  CreateStoreBody,
  GetStoreBySlugParams,
  GetStoreBySlugResponse,
  UpdateStoreParams,
  UpdateStoreBody,
  UpdateStoreResponse,
  GetStoreSummaryParams,
  GetStoreSummaryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/stores", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.slug, parsed.data.slug));

  if (existing.length > 0) {
    res.status(409).json({ error: "This store URL is already taken" });
    return;
  }

  const [store] = await db
    .insert(storesTable)
    .values({ ...parsed.data, sellerId: res.locals.seller.sellerId })
    .returning();
  res.status(201).json(GetStoreBySlugResponse.parse(store));
});

// GET /stores?q=search&limit=12
router.get("/stores", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(parseInt(typeof req.query.limit === "string" ? req.query.limit : "12", 10) || 12, 48);

  const stores = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      slug: storesTable.slug,
      description: storesTable.description,
      logoUrl: storesTable.logoUrl,
      currency: storesTable.currency,
      productCount: sql<number>`count(${productsTable.id})::int`,
    })
    .from(storesTable)
    .leftJoin(productsTable, eq(productsTable.storeId, storesTable.id))
    .where(q ? sql`lower(${storesTable.name}) like ${'%' + q.toLowerCase() + '%'} or lower(${storesTable.slug}) like ${'%' + q.toLowerCase() + '%'}` : sql`1=1`)
    .groupBy(storesTable.id)
    .orderBy(sql`${storesTable.createdAt} desc`)
    .limit(limit);

  res.json(stores);
});

router.get("/stores/:slug", async (req, res): Promise<void> => {
  const params = GetStoreBySlugParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.slug, params.data.slug));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  res.json(GetStoreBySlugResponse.parse(store));
});

router.patch("/stores/:slug", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.slug, params.data.slug));

  if (!existing) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  if (existing.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this store" });
    return;
  }

  const [store] = await db
    .update(storesTable)
    .set(parsed.data)
    .where(eq(storesTable.slug, params.data.slug))
    .returning();

  res.json(UpdateStoreResponse.parse(store));
});

router.get("/stores/:storeId/summary", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const storeId = parseInt(raw, 10);

  if (isNaN(storeId)) {
    res.status(400).json({ error: "Invalid store ID" });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, storeId));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(eq(productsTable.storeId, storeId));

  res.json(
    GetStoreSummaryResponse.parse({
      totalProducts: countResult.count,
      storeName: store.name,
      storeSlug: store.slug,
    })
  );
});

export default router;
