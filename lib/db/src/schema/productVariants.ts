import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const productVariantsTable = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),          // "S", "M", "40", "42", "Red", etc.
  inStock: boolean("in_stock").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductVariant = typeof productVariantsTable.$inferSelect;
