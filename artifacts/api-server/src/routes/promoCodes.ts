import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, storesTable, promoCodesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ── Seller: list codes for a store ────────────────────────────────────────────
router.get("/stores/:storeId/promo-codes", requireAuth, async (req, res): Promise<void> => {
  const storeId = parseInt(req.params.storeId as string, 10);
  if (isNaN(storeId)) { res.status(400).json({ error: "Invalid store ID" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "Not authorized" }); return; }

  const codes = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.storeId, storeId))
    .orderBy(promoCodesTable.createdAt);

  res.json(codes.reverse());
});

// ── Seller: create a new promo code ──────────────────────────────────────────
router.post("/stores/:storeId/promo-codes", requireAuth, async (req, res): Promise<void> => {
  const storeId = parseInt(req.params.storeId as string, 10);
  if (isNaN(storeId)) { res.status(400).json({ error: "Invalid store ID" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "Not authorized" }); return; }

  const { code, type, value, maxUses, expiresAt } = req.body as {
    code?: string;
    type?: string;
    value?: string | number;
    maxUses?: number | null;
    expiresAt?: string | null;
  };

  if (!code || !code.trim()) { res.status(400).json({ error: "Code is required" }); return; }
  if (!["percent", "fixed"].includes(type ?? "")) { res.status(400).json({ error: "Type must be 'percent' or 'fixed'" }); return; }
  const numValue = parseFloat(String(value));
  if (isNaN(numValue) || numValue <= 0) { res.status(400).json({ error: "Value must be a positive number" }); return; }
  if (type === "percent" && numValue > 100) { res.status(400).json({ error: "Percentage discount cannot exceed 100%" }); return; }

  const upperCode = code.trim().toUpperCase().replace(/\s+/g, "");

  try {
    const [promo] = await db.insert(promoCodesTable).values({
      storeId,
      code: upperCode,
      type: type!,
      value: numValue.toFixed(2),
      maxUses: maxUses ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      active: true,
    }).returning();

    res.status(201).json(promo);
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? "";
    if (msg.includes("unique")) {
      res.status(409).json({ error: `Code "${upperCode}" already exists for this store` });
    } else {
      res.status(500).json({ error: "Failed to create promo code" });
    }
  }
});

// ── Seller: toggle active / delete ────────────────────────────────────────────
router.patch("/promo-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.id, id));
  if (!promo) { res.status(404).json({ error: "Promo code not found" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, promo.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "Not authorized" }); return; }

  const { active } = req.body as { active?: boolean };
  const [updated] = await db
    .update(promoCodesTable)
    .set({ active: active ?? !promo.active })
    .where(eq(promoCodesTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/promo-codes/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.id, id));
  if (!promo) { res.status(404).json({ error: "Promo code not found" }); return; }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, promo.storeId));
  if (!store || store.sellerId !== res.locals.seller.sellerId) { res.status(403).json({ error: "Not authorized" }); return; }

  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id));
  res.json({ ok: true });
});

// ── Public: validate a code (buyer-facing, no auth) ──────────────────────────
// POST /api/promo-codes/validate  { code, storeId, amount }
router.post("/promo-codes/validate", async (req, res): Promise<void> => {
  const { code, storeId, amount } = req.body as {
    code?: string;
    storeId?: number;
    amount?: number;
  };

  if (!code || !storeId || isNaN(Number(storeId))) {
    res.status(400).json({ valid: false, reason: "code and storeId are required" });
    return;
  }

  const upperCode = code.trim().toUpperCase();

  const [promo] = await db
    .select()
    .from(promoCodesTable)
    .where(and(
      eq(promoCodesTable.storeId, Number(storeId)),
      eq(promoCodesTable.code, upperCode),
      eq(promoCodesTable.active, true),
    ));

  if (!promo) {
    res.json({ valid: false, reason: "Invalid or inactive code" });
    return;
  }

  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
    res.json({ valid: false, reason: "This code has expired" });
    return;
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    res.json({ valid: false, reason: "This code has reached its usage limit" });
    return;
  }

  const orderAmount = parseFloat(String(amount ?? 0)) || 0;
  const promoValue = parseFloat(promo.value);
  let discountAmount = 0;

  if (promo.type === "percent") {
    discountAmount = (orderAmount * promoValue) / 100;
  } else {
    discountAmount = promoValue;
  }

  discountAmount = Math.min(discountAmount, orderAmount);
  const finalAmount = Math.max(0, orderAmount - discountAmount);

  res.json({
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promoValue,
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAmount: Math.round(finalAmount * 100) / 100,
    usesLeft: promo.maxUses !== null ? promo.maxUses - promo.usedCount : null,
  });
});

export default router;
