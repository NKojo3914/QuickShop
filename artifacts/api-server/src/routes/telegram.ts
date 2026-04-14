import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, storesTable, processedTelegramUpdatesTable } from "@workspace/db";
import { SetupTelegramWebhookParams, SetupTelegramWebhookResponse } from "@workspace/api-zod";
import { processTelegramUpdate } from "../lib/telegramCore";

const router: IRouter = Router();

router.post("/telegram/webhook/:storeId", async (req, res): Promise<void> => {
  // Respond immediately — prevents Telegram from retrying due to slow AI calls.
  res.json({ ok: true });

  const raw = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const storeId = parseInt(raw, 10);
  if (isNaN(storeId)) return;

  const body = req.body as Record<string, unknown>;
  const updateId = typeof body.update_id === "number" ? body.update_id : null;

  // DB-level dedup: claim this update_id with a unique INSERT.
  // If another instance (or a retry) already claimed it, the INSERT returns nothing → skip.
  if (updateId !== null) {
    try {
      const claimed = await db
        .insert(processedTelegramUpdatesTable)
        .values({ updateId })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0) {
        req.log.warn({ storeId, updateId }, "Telegram webhook: duplicate update_id, skipping");
        return;
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "42P01") {
        // Table doesn't exist yet (race with startup migration) — process without dedup this once.
        req.log.warn({ updateId }, "Telegram dedup table missing, processing without dedup");
      } else {
        // Unexpected DB error — log but don't block the message.
        req.log.error({ err, updateId }, "Telegram dedup INSERT failed");
      }
    }
  }

  req.log.info({ storeId, updateId }, "Telegram webhook processing");

  processTelegramUpdate(storeId, body, req.log).catch((err) => {
    req.log.error({ err }, "Telegram webhook handler threw");
  });
});

router.post("/stores/:slug/telegram/setup", async (req, res): Promise<void> => {
  const params = SetupTelegramWebhookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.slug, params.data.slug));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  if (!store.telegramBotToken) {
    res.status(400).json({ error: "No Telegram bot token configured" });
    return;
  }

  const baseUrlFromEnv = process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim().replace(/\/+$/, "");

  // In polling mode (no public webhook URL configured), skip webhook registration.
  // The server polls Telegram for updates automatically via getUpdates.
  if (!baseUrlFromEnv) {
    res.json(
      SetupTelegramWebhookResponse.parse({
        ok: true,
        message: "Telegram bot is connected (polling mode — no public URL configured).",
        webhookUrl: "",
      }),
    );
    return;
  }

  const webhookUrl = `${baseUrlFromEnv}/api/telegram/webhook/${store.id}`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${store.telegramBotToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const tgData = (await tgRes.json()) as { ok: boolean; description?: string };

    if (!tgData.ok) {
      res.status(400).json({ error: tgData.description || "Failed to register webhook with Telegram" });
      return;
    }

    res.json(
      SetupTelegramWebhookResponse.parse({
        ok: true,
        message: "Telegram bot is connected (webhook).",
        webhookUrl,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to register Telegram webhook");
    res.status(400).json({ error: "Failed to connect to Telegram. Check your bot token." });
  }
});

export default router;
