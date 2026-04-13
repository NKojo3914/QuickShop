import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable } from "@workspace/db";
import { SetupTelegramWebhookParams, SetupTelegramWebhookResponse } from "@workspace/api-zod";
import { processTelegramUpdate } from "../lib/telegramCore";

const router: IRouter = Router();

router.post("/telegram/webhook/:storeId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const storeId = parseInt(raw, 10);

  req.log.info({ storeId, body: req.body }, "Telegram webhook hit");

  if (isNaN(storeId)) {
    res.json({ ok: true });
    return;
  }

  try {
    await processTelegramUpdate(storeId, req.body as Record<string, unknown>, req.log);
  } catch (err) {
    req.log.error({ err }, "Telegram webhook handler threw");
  }
  res.json({ ok: true });
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
