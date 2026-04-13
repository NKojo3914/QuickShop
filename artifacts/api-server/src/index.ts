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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startTelegramPolling(logger);
});
