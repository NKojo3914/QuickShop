import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, productsTable, storesTable, productVariantsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateProductParams,
  CreateProductBody,
  ListProductsParams,
  ListProductsResponse,
  GetProductParams,
  GetProductResponse,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  DeleteProductParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

/** Attach variants array to a list of products in one extra query */
async function attachVariants(products: (typeof productsTable.$inferSelect)[]) {
  if (products.length === 0) return products.map((p) => ({ ...p, variants: [] }));
  const ids = products.map((p) => p.id);
  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(inArray(productVariantsTable.productId, ids))
    .orderBy(productVariantsTable.sortOrder, productVariantsTable.id);

  const byProduct: Record<number, typeof variants> = {};
  for (const v of variants) {
    (byProduct[v.productId] ??= []).push(v);
  }
  return products.map((p) => ({ ...p, variants: byProduct[p.id] ?? [] }));
}

router.get("/stores/:storeId/products", async (req, res): Promise<void> => {
  const params = ListProductsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.storeId, params.data.storeId))
    .orderBy(productsTable.createdAt);

  const withVariants = await attachVariants(products);
  res.json(ListProductsResponse.parse(withVariants));
});

router.post("/stores/:storeId/products", requireAuth, async (req, res): Promise<void> => {
  const params = CreateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, params.data.storeId));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  if (store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this store" });
    return;
  }

  const sanitizedPrice = parsed.data.price.replace(/[^0-9.]/g, "");
  const priceNum = parseFloat(sanitizedPrice);
  if (isNaN(priceNum) || priceNum < 0) {
    res.status(400).json({ error: "Invalid price value" });
    return;
  }

  const { variants, ...productData } = parsed.data;

  const [product] = await db
    .insert(productsTable)
    .values({
      ...productData,
      price: sanitizedPrice,
      storeId: params.data.storeId,
    })
    .returning();

  // Insert variants if provided
  let insertedVariants: (typeof productVariantsTable.$inferSelect)[] = [];
  if (variants && variants.length > 0) {
    insertedVariants = await db
      .insert(productVariantsTable)
      .values(
        variants.map((v, i) => ({
          productId: product.id,
          label: v.label,
          inStock: v.inStock ?? true,
          sortOrder: v.sortOrder ?? i,
        }))
      )
      .returning();
  }

  res.status(201).json(GetProductResponse.parse({ ...product, variants: insertedVariants }));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [withVariants] = await attachVariants([product]);
  res.json(GetProductResponse.parse(withVariants));
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, existing.storeId));

  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this product" });
    return;
  }

  const { variants, ...updateFields } = parsed.data;
  const updateData: typeof updateFields = { ...updateFields };
  if (updateData.price !== undefined) {
    const sanitizedPrice = updateData.price.replace(/[^0-9.]/g, "");
    const priceNum = parseFloat(sanitizedPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      res.status(400).json({ error: "Invalid price value" });
      return;
    }
    updateData.price = sanitizedPrice;
  }

  const [product] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  // Replace variants if the field was supplied (even if empty array — clears all)
  let currentVariants: (typeof productVariantsTable.$inferSelect)[] = [];
  if (variants !== undefined) {
    await db.delete(productVariantsTable).where(eq(productVariantsTable.productId, product.id));
    if (variants.length > 0) {
      currentVariants = await db
        .insert(productVariantsTable)
        .values(
          variants.map((v, i) => ({
            productId: product.id,
            label: v.label,
            inStock: v.inStock ?? true,
            sortOrder: v.sortOrder ?? i,
          }))
        )
        .returning();
    }
  } else {
    // Keep existing variants
    currentVariants = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, product.id))
      .orderBy(productVariantsTable.sortOrder, productVariantsTable.id);
  }

  res.json(UpdateProductResponse.parse({ ...product, variants: currentVariants }));
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, existing.storeId));

  if (!store || store.sellerId !== res.locals.seller.sellerId) {
    res.status(403).json({ error: "You do not own this product" });
    return;
  }

  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
