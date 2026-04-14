import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable, processedTelegramUpdatesTable } from "@workspace/db";
import { pool } from "@workspace/db";
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

  // ── Dedup layer 1: update_id (same physical delivery / Telegram retry) ──────
  if (updateId !== null) {
    try {
      const claimed = await db
        .insert(processedTelegramUpdatesTable)
        .values({ updateId })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0) {
        req.log.warn({ storeId, updateId }, "Telegram: duplicate update_id, skipping");
        return;
      }
    } catch (err) {
      req.log.warn({ err, updateId }, "Telegram dedup (update_id) failed, continuing");
    }
  }

  // ── Dedup layer 2: content + chatId within 30 s ───────────────────────────
  // On macOS, window.open('https://t.me/...') triggers BOTH Telegram Desktop
  // (via Universal Link) AND Telegram Web — two different update_ids, same message.
  const msgBody = body.message as Record<string, unknown> | undefined;
  const chatId  = typeof (msgBody?.chat as Record<string, unknown> | undefined)?.id === "number"
    ? (msgBody!.chat as Record<string, unknown>).id as number
    : null;
  const msgText = typeof msgBody?.text === "string" ? msgBody.text : null;

  if (chatId !== null && msgText !== null) {
    // content_hash = first 80 chars is enough to identify the message
    const contentHash = `${chatId}:${msgText.slice(0, 80)}`;
    try {
      const result = await pool.query<{ id: number }>(`
        WITH cleanup AS (
          DELETE FROM telegram_chat_dedup
          WHERE chat_id = $1 AND content_hash = $2
            AND created_at < NOW() - INTERVAL '30 seconds'
        )
        INSERT INTO telegram_chat_dedup (chat_id, content_hash)
        VALUES ($1, $2)
        ON CONFLICT (chat_id, content_hash) DO NOTHING
        RETURNING ctid
      `, [chatId, contentHash]);
      if (result.rowCount === 0) {
        req.log.warn({ storeId, chatId }, "Telegram: duplicate content within 30 s, skipping");
        return;
      }
    } catch (err) {
      req.log.warn({ err }, "Telegram content dedup failed, continuing");
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
