import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerTelegramChatId: integer("customer_telegram_chat_id"),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("telegram"), // "telegram" | "whatsapp"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Order = typeof ordersTable.$inferSelect;
