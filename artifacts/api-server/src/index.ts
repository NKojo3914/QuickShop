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

// Ensure the Telegram update dedup table exists before accepting traffic.
// This runs every startup so it works even if the pre-deploy migration wasn't run.
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_telegram_updates (
      update_id   INTEGER PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Clean up rows older than 1 hour to keep the table small
    DELETE FROM processed_telegram_updates WHERE processed_at < NOW() - INTERVAL '1 hour';
  `);
  logger.info("Telegram dedup table ready");
} catch (err) {
  logger.warn({ err }, "Could not ensure Telegram dedup table — duplicate updates may occur");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startTelegramPolling(logger);
});
