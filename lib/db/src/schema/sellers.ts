import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sellersTable = pgTable("sellers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSellerSchema = createInsertSchema(sellersTable).omit({ id: true, createdAt: true });
export type InsertSeller = z.infer<typeof insertSellerSchema>;
export type Seller = typeof sellersTable.$inferSelect;
