import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { storesTable } from "./stores";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  // Each order can be reviewed at most once (enforced by unique index)
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  // Denormalized for fast per-store lookups
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  // 1..5
  rating: integer("rating").notNull(),
  // Optional written feedback
  body: text("body"),
  // Snapshot of customer name at review time (orders.customerName may be null/edited)
  customerName: text("customer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Review = typeof reviewsTable.$inferSelect;
