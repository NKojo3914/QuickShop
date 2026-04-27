import { pgTable, text, serial, integer, bigint, timestamp, numeric } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerTelegramChatId: bigint("customer_telegram_chat_id", { mode: "number" }),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("telegram"), // "telegram" | "whatsapp"

  // ── Payment / escrow ────────────────────────────────────────────────────────
  // Total order amount (in major units, e.g. 1450.00 GHS). Null until parsed
  // from the order summary at payment-init time.
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency"),
  // Paystack transaction reference returned from /transaction/initialize
  paymentReference: text("payment_reference"),
  // unpaid | pending | paid | failed | refunded
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Set when the seller marks the order as shipped — starts the auto-release timer.
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  shippedPhotoUrl: text("shipped_photo_url"),
  // Set when the buyer confirms receipt (manual release).
  receivedAt: timestamp("received_at", { withTimezone: true }),
  // Set when escrow is released to the seller (transfer initiated).
  releasedAt: timestamp("released_at", { withTimezone: true }),
  payoutReference: text("payout_reference"),
  // pending | success | failed
  payoutStatus: text("payout_status"),
  // Buyer-raised dispute window — blocks auto-release.
  disputeRaisedAt: timestamp("dispute_raised_at", { withTimezone: true }),
  // Platform cut deducted from the payout (in major units).
  platformFee: numeric("platform_fee", { precision: 12, scale: 2 }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Order = typeof ordersTable.$inferSelect;
