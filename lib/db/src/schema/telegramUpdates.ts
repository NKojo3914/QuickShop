import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Deduplicates Telegram webhook/polling updates across multiple server instances.
 * Before processing an update, we INSERT its update_id here. If the insert fails
 * (unique violation), another instance already handled it — skip processing.
 * Old rows are cleaned up after 1 hour by the server on startup.
 */
export const processedTelegramUpdatesTable = pgTable("processed_telegram_updates", {
  updateId: integer("update_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
