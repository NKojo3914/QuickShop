import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, storesTable, productsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /search?q=query&limit=8
 * Returns matching stores and products for the landing page search.
 */
router.get("/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(parseInt(typeof req.query.limit === "string" ? req.query.limit : "8", 10) || 8, 24);

  if (!q) {
    res.json({ stores: [], products: [] });
    return;
  }

  const pattern = `%${q.toLowerCase()}%`;

  const [stores, products] = await Promise.all([
    db
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
      .where(sql`lower(${storesTable.name}) like ${pattern} or lower(${storesTable.slug}) like ${pattern}`)
      .groupBy(storesTable.id)
      .orderBy(sql`${storesTable.createdAt} desc`)
      .limit(limit),

    db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        price: productsTable.price,
        description: productsTable.description,
        imageUrl: productsTable.imageUrl,
        inStock: productsTable.inStock,
        storeId: storesTable.id,
        storeName: storesTable.name,
        storeSlug: storesTable.slug,
        currency: storesTable.currency,
      })
      .from(productsTable)
      .innerJoin(storesTable, eq(storesTable.id, productsTable.storeId))
      .where(sql`lower(${productsTable.name}) like ${pattern} or lower(coalesce(${productsTable.description}, '')) like ${pattern}`)
      .orderBy(sql`${productsTable.createdAt} desc`)
      .limit(limit),
  ]);

  res.json({ stores, products });
});

export default router;
