import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, sellersTable, storesTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [existing] = await db
    .select({ id: sellersTable.id })
    .from(sellersTable)
    .where(eq(sellersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [seller] = await db
    .insert(sellersTable)
    .values({ email, passwordHash })
    .returning({ id: sellersTable.id, email: sellersTable.email });

  const token = signToken({ sellerId: seller.id, email: seller.email });
  res.cookie("auth_token", token, COOKIE_OPTIONS);
  res.status(201).json({ sellerId: seller.id, email: seller.email });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email: identifier, password } = parsed.data;

  let seller: typeof sellersTable.$inferSelect | undefined;

  if (identifier.includes("@")) {
    // Treat as email
    const [row] = await db
      .select()
      .from(sellersTable)
      .where(eq(sellersTable.email, identifier));
    seller = row;
  } else {
    // Treat as store slug — look up the store, then its seller
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.slug, identifier.toLowerCase().trim()));

    if (store?.sellerId) {
      const [row] = await db
        .select()
        .from(sellersTable)
        .where(eq(sellersTable.id, store.sellerId));
      seller = row;
    }
  }

  if (!seller) {
    res.status(401).json({ error: "Invalid email/username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, seller.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email/username or password" });
    return;
  }

  const token = signToken({ sellerId: seller.id, email: seller.email });
  res.cookie("auth_token", token, COOKIE_OPTIONS);
  res.json({ sellerId: seller.id, email: seller.email });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie("auth_token", { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(res.locals.seller);
});

router.get("/auth/my-store", requireAuth, async (req, res): Promise<void> => {
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.sellerId, res.locals.seller.sellerId));

  if (!store) {
    res.status(404).json({ error: "No store found" });
    return;
  }

  res.json({ slug: store.slug, name: store.name });
});

export default router;
