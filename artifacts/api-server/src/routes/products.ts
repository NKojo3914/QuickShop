import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, productsTable, storesTable, productVariantsTable, productImagesTable } from "@workspace/db";
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

type ProductRow = typeof productsTable.$inferSelect;
type VariantRow = typeof productVariantsTable.$inferSelect;
type ImageRow = typeof productImagesTable.$inferSelect;

/** Attach variants + images to a list of products in two extra queries */
async function attachRelated(products: ProductRow[]) {
  if (products.length === 0) {
    return products.map(p => ({ ...p, variants: [] as VariantRow[], images: [] as ImageRow[] }));
  }
  const ids = products.map(p => p.id);

  const [variants, images] = await Promise.all([
    db
      .select()
      .from(productVariantsTable)
      .where(inArray(productVariantsTable.productId, ids))
      .orderBy(productVariantsTable.sortOrder, productVariantsTable.id),
    db
      .select()
      .from(productImagesTable)
      .where(inArray(productImagesTable.productId, ids))
      .orderBy(productImagesTable.sortOrder, productImagesTable.id),
  ]);

  const variantsByProduct: Record<number, VariantRow[]> = {};
  for (const v of variants) (variantsByProduct[v.productId] ??= []).push(v);

  const imagesByProduct: Record<number, ImageRow[]> = {};
  for (const img of images) (imagesByProduct[img.productId] ??= []).push(img);

  return products.map(p => ({
    ...p,
    variants: variantsByProduct[p.id] ?? [],
    images: imagesByProduct[p.id] ?? [],
  }));
}

/** Replace the images for a product (delete all, re-insert in order) */
async function replaceImages(productId: number, urls: string[]) {
  await db.delete(productImagesTable).where(eq(productImagesTable.productId, productId));
  if (urls.length > 0) {
    await db.insert(productImagesTable).values(
      urls.map((url, i) => ({ productId, url, sortOrder: i }))
    );
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/stores/:storeId/products", async (req, res): Promise<void> => {
  const params = ListProductsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.storeId, params.data.storeId))
    .orderBy(productsTable.createdAt);

  res.json(ListProductsResponse.parse(await attachRelated(products)));
});

router.post("/stores/:storeId/products", requireAuth, async (req, res): Promise<void> => {
  const params = CreateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, params.data.storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "You do not own this store" }); return; }

  const sanitizedPrice = parsed.data.price.replace(/[^0-9.]/g, "");
  if (isNaN(parseFloat(sanitizedPrice)) || parseFloat(sanitizedPrice) < 0) {
    res.status(400).json({ error: "Invalid price value" }); return;
  }

  const { variants, images, ...productData } = parsed.data;

  // First image becomes the primary imageUrl if not explicitly set
  const primaryImageUrl = productData.imageUrl ?? (images && images[0]) ?? undefined;

  const [product] = await db
    .insert(productsTable)
    .values({ ...productData, imageUrl: primaryImageUrl, price: sanitizedPrice, storeId: params.data.storeId })
    .returning();

  // Insert variants
  let insertedVariants: VariantRow[] = [];
  if (variants && variants.length > 0) {
    insertedVariants = await db
      .insert(productVariantsTable)
      .values(variants.map((v, i) => ({ productId: product.id, label: v.label, inStock: v.inStock ?? true, sortOrder: v.sortOrder ?? i })))
      .returning();
  }

  // Insert gallery images (skip index 0 if it's already the primary imageUrl)
  let insertedImages: ImageRow[] = [];
  if (images && images.length > 0) {
    await replaceImages(product.id, images);
    insertedImages = await db.select().from(productImagesTable).where(eq(productImagesTable.productId, product.id)).orderBy(productImagesTable.sortOrder);
  }

  res.status(201).json(GetProductResponse.parse({ ...product, variants: insertedVariants, images: insertedImages }));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [withRelated] = await attachRelated([product]);
  res.json(GetProductResponse.parse(withRelated));
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, existing.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "You do not own this product" }); return; }

  const { variants, images, ...updateFields } = parsed.data;

  if (updateFields.price !== undefined) {
    const sanitized = updateFields.price.replace(/[^0-9.]/g, "");
    if (isNaN(parseFloat(sanitized)) || parseFloat(sanitized) < 0) {
      res.status(400).json({ error: "Invalid price value" }); return;
    }
    updateFields.price = sanitized;
  }

  // If images are being updated and no explicit imageUrl, use first gallery image as primary
  if (images !== undefined && updateFields.imageUrl === undefined) {
    updateFields.imageUrl = images[0] ?? null as unknown as undefined;
  }

  const [product] = await db
    .update(productsTable)
    .set(updateFields)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  // Replace variants if supplied
  let currentVariants: VariantRow[] = [];
  if (variants !== undefined) {
    await db.delete(productVariantsTable).where(eq(productVariantsTable.productId, product.id));
    if (variants.length > 0) {
      currentVariants = await db
        .insert(productVariantsTable)
        .values(variants.map((v, i) => ({ productId: product.id, label: v.label, inStock: v.inStock ?? true, sortOrder: v.sortOrder ?? i })))
        .returning();
    }
  } else {
    currentVariants = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, product.id))
      .orderBy(productVariantsTable.sortOrder, productVariantsTable.id);
  }

  // Replace images if supplied
  let currentImages: ImageRow[] = [];
  if (images !== undefined) {
    await replaceImages(product.id, images);
    currentImages = await db.select().from(productImagesTable).where(eq(productImagesTable.productId, product.id)).orderBy(productImagesTable.sortOrder);
  } else {
    currentImages = await db.select().from(productImagesTable).where(eq(productImagesTable.productId, product.id)).orderBy(productImagesTable.sortOrder);
  }

  res.json(UpdateProductResponse.parse({ ...product, variants: currentVariants, images: currentImages }));
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, existing.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "You do not own this product" }); return; }

  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
