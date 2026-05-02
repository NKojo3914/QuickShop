import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN ?? true,
  credentials: true,
}));
app.use(cookieParser());
// Capture the raw request body so HMAC-signed webhooks (e.g. Paystack) can
// verify the signature against the exact bytes Paystack signed. Without this
// JSON.stringify() of the parsed body would re-serialize whitespace differently
// and the HMAC would never match.
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the built frontend in production
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(__dirname, "../../shop/dist/public");
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API routes serve index.html
  app.get("/*splat", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// JSON error handler — must be the LAST middleware. Without this, unhandled
// errors fall through to Express's default HTML error page, which the
// frontend can't usefully parse for toasts.
const jsonErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Pull the underlying pg error out of err.cause so we log something useful
  const cause = (err as { cause?: unknown })?.cause;
  logger.error({ err, cause, path: req.path, method: req.method }, "Unhandled API error");
  if (res.headersSent) return;
  const causeMsg = (cause as { message?: string; detail?: string } | undefined)?.message
    ?? (cause as { detail?: string } | undefined)?.detail;
  const message = causeMsg
    || (err instanceof Error ? err.message : "Internal Server Error");
  res.status(500).json({ error: message });
};
app.use(jsonErrorHandler);

export default app;
