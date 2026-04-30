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

  // ── Amounts ─────────────────────────────────────────────────────────────────
  // Product price only (excluding delivery + platform fee).
  amount: numeric("amount", { precision: 12, scale: 2 }),
  // Delivery fee charged to buyer at order time (from store's deliveryFee setting).
  deliveryFee: numeric("delivery_fee", { precision: 12, scale: 2 }),
  // Platform fee (1% of amount) added to buyer's payment.
  platformFee: numeric("platform_fee", { precision: 12, scale: 2 }),
  // Total charged to buyer = amount + deliveryFee + platformFee.
  totalCharged: numeric("total_charged", { precision: 12, scale: 2 }),
  currency: text("currency"),

  // ── Payment / escrow ────────────────────────────────────────────────────────
  paymentReference: text("payment_reference"),
  // unpaid | pending | paid | failed | refunded
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // ── Delivery code ────────────────────────────────────────────────────────────
  // 6-digit code sent to buyer on payment. Buyer shares it with delivery person
  // on receipt. Seller enters it to release escrow.
  deliveryCode: text("delivery_code"),
  deliveryCodeVerifiedAt: timestamp("delivery_code_verified_at", { withTimezone: true }),

  // ── Shipping / escrow release ────────────────────────────────────────────────
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  shippedPhotoUrl: text("shipped_photo_url"),
  // 48h after shippedAt — auto-release fires if buyer hasn't entered code yet.
  autoReleaseAt: timestamp("auto_release_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  payoutReference: text("payout_reference"),
  // pending | success | failed
  payoutStatus: text("payout_status"),

  // ── Refunds (vendor ghost scenario) ─────────────────────────────────────────
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  refundReference: text("refund_reference"),

  // ── Disputes ─────────────────────────────────────────────────────────────────
  disputeRaisedAt: timestamp("dispute_raised_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Order = typeof ordersTable.$inferSelect;
