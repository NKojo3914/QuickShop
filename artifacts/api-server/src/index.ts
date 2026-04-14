import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnv = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: repoRootEnv });
dotenv.config();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const { default: app } = await import("./app");
const { logger } = await import("./lib/logger");
const { startTelegramPolling } = await import("./lib/telegramPolling");
const { pool } = await import("@workspace/db");

// Ensure Telegram dedup tables exist before accepting traffic.
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_telegram_updates (
      update_id    INTEGER PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Content-level dedup: catches duplicates from different clients (Telegram Desktop +
    -- Telegram Web both sending the same /start when a t.me link is opened on macOS).
    CREATE TABLE IF NOT EXISTS telegram_chat_dedup (
      chat_id      BIGINT  NOT NULL,
      content_hash TEXT    NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (chat_id, content_hash)
    );

    DELETE FROM processed_telegram_updates WHERE processed_at   < NOW() - INTERVAL '1 hour';
    DELETE FROM telegram_chat_dedup           WHERE created_at  < NOW() - INTERVAL '1 minute';
  `);
  logger.info("Telegram dedup tables ready");
} catch (err) {
  logger.warn({ err }, "Could not ensure Telegram dedup tables");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startTelegramPolling(logger);
});
