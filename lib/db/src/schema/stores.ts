import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sellersTable } from "./sellers";

export const storesTable = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  telegramBotToken: text("telegram_bot_token"),
  telegramBotUsername: text("telegram_bot_username"),
  sellerTelegramChatId: text("seller_telegram_chat_id"),
  currency: text("currency").notNull().default("GHS"),
  sellerId: integer("seller_id").references(() => sellersTable.id, { onDelete: "set null" }),

  // ── Delivery ──────────────────────────────────────────────────────────────
  // Flat delivery fee added to every Telegram order payment link.
  // Sellers set this in Store Settings. 0 = free delivery.
  deliveryFee: numeric("delivery_fee", { precision: 12, scale: 2 }).default("0"),

  // ── Paystack payout ────────────────────────────────────────────────────────
  paystackBankCode: text("paystack_bank_code"),
  paystackAccountNumber: text("paystack_account_number"),
  paystackAccountName: text("paystack_account_name"),
  paystackRecipientCode: text("paystack_recipient_code"),

  // ── Vendor security deposit ────────────────────────────────────────────────
  // GHS 50 held as security. Deducted when vendor ghosts a buyer.
  // Topped up via a Paystack transaction. Suspended if balance < 0.
  vendorDeposit: numeric("vendor_deposit", { precision: 12, scale: 2 }).default("0"),
  vendorDepositPaidAt: timestamp("vendor_deposit_paid_at", { withTimezone: true }),
  vendorDepositReference: text("vendor_deposit_reference"),
  // Accumulated debt owed to platform (when deposit runs out).
  vendorDebt: numeric("vendor_debt", { precision: 12, scale: 2 }).default("0"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
