import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable, storesTable } from "@workspace/db";
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

  res.json(ListProductsResponse.parse(products));
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

  const [product] = await db
    .insert(productsTable)
    .values({
      ...parsed.data,
      price: sanitizedPrice,
      storeId: params.data.storeId,
    })
    .returning();

  res.status(201).json(GetProductResponse.parse(product));
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

  res.json(GetProductResponse.parse(product));
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

  const updateData: typeof parsed.data = { ...parsed.data };
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

  res.json(UpdateProductResponse.parse(product));
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
