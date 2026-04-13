import { isNotNull } from "drizzle-orm";
import { db, storesTable } from "@workspace/db";
import type { Logger } from "pino";
import { processTelegramUpdate } from "./telegramCore";

const offsets = new Map<string, number>();

function isMissingSchemaError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const msg = current.message;
    if (msg.includes("does not exist") && (msg.includes("relation") || msg.includes("table"))) return true;
    const code = (current as { code?: string }).code;
    if (code === "42P01") return true;
    current = current.cause;
  }
  const top = err instanceof Error ? err.message : String(err);
  return top.includes("does not exist") && (top.includes("relation") || top.includes("table"));
}

function shouldUsePolling(): boolean {
  if (process.env.TELEGRAM_POLLING === "true") return true;
  if (process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim()) return false;
  // Local dev: no public URL → poll. Production: opt in with TELEGRAM_POLLING=true.
  return process.env.NODE_ENV === "development";
}

async function deleteWebhook(botToken: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
}

/**
 * Long-polling so Telegram works on localhost without ngrok.
 * When TELEGRAM_WEBHOOK_BASE_URL is set, polling is skipped (webhook mode).
 */
export function startTelegramPolling(logger: Logger): void {
  if (!shouldUsePolling()) {
    logger.info("Telegram polling disabled (TELEGRAM_WEBHOOK_BASE_URL set or TELEGRAM_POLLING not forced)");
    return;
  }

  logger.info(
    { mode: "polling" },
    "Telegram: using getUpdates polling (no public webhook URL). Set TELEGRAM_WEBHOOK_BASE_URL to use webhooks instead.",
  );

  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const stopPolling = (reason: string) => {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    pollTimer = undefined;
    logger.warn(
      { reason },
      "Telegram polling stopped. Fix the database (see message), then restart the API.",
    );
  };

  void (async () => {
    try {
      const stores = await db.select().from(storesTable).where(isNotNull(storesTable.telegramBotToken));
      const seenTokens = new Set<string>();
      for (const s of stores) {
        if (!s.telegramBotToken || seenTokens.has(s.telegramBotToken)) continue;
        seenTokens.add(s.telegramBotToken);
        await deleteWebhook(s.telegramBotToken);
      }
    } catch (err) {
      if (isMissingSchemaError(err)) {
        logger.warn(
          { err },
          "Database has no QuickShop tables yet. Run: corepack pnpm --filter \"@workspace/db\" push (same DATABASE_URL as the API).",
        );
        return;
      }
      logger.error({ err }, "Telegram deleteWebhook on poll startup failed");
    }

    let isTicking = false;

    const tick = async () => {
      // Guard: skip this interval if the previous tick is still processing
      if (isTicking) return;
      isTicking = true;
      try {
        const stores = await db.select().from(storesTable).where(isNotNull(storesTable.telegramBotToken));
        for (const store of stores) {
          const token = store.telegramBotToken!;
          let offset = offsets.get(token) ?? 0;
          // Use timeout=0 (short-poll, returns immediately) since we drive the interval ourselves.
          // timeout=25 would hold each connection open 25 s, causing many concurrent requests.
          const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${offset}`;
          const res = await fetch(url);
          const data = (await res.json()) as {
            ok: boolean;
            result?: Array<{ update_id: number } & Record<string, unknown>>;
          };
          if (!data.ok || !data.result?.length) continue;

          for (const upd of data.result) {
            offset = upd.update_id + 1;
            offsets.set(token, offset);
            await processTelegramUpdate(store.id, upd as Record<string, unknown>, logger);
          }
        }
      } catch (err) {
        if (isMissingSchemaError(err)) {
          stopPolling("missing_database_tables");
          logger.warn(
            { err },
            "Telegram polling stopped: database tables missing. Run: corepack pnpm --filter \"@workspace/db\" push",
          );
          return;
        }
        logger.error({ err }, "Telegram polling tick failed");
      } finally {
        isTicking = false;
      }
    };

    pollTimer = setInterval(() => {
      void tick();
    }, 1500);
  })();
}
