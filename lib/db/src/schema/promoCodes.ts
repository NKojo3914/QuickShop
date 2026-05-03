import { pgTable, serial, integer, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  // Uppercase code buyers enter (e.g. "SAVE10"). Unique per store.
  code: text("code").notNull(),
  // "percent" = value% off, "fixed" = value currency units off
  type: text("type").notNull().default("percent"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  // null = unlimited
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  // null = never expires
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromoCode = typeof promoCodesTable.$inferSelect;
