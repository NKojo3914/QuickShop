import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
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

  // ── Payout / Paystack escrow ───────────────────────────────────────────────
  // Paystack bank/MoMo code returned from /bank?currency=GHS (e.g. "MTN" for MoMo).
  paystackBankCode: text("paystack_bank_code"),
  // The seller's account or MoMo number to pay out to.
  paystackAccountNumber: text("paystack_account_number"),
  paystackAccountName: text("paystack_account_name"),
  // Paystack transfer-recipient code created from the bank details above —
  // required to initiate transfers when releasing escrow.
  paystackRecipientCode: text("paystack_recipient_code"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
