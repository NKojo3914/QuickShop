import { Router, type IRouter, type Request, type Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const LOCAL_UPLOADS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "local-uploads",
);

async function ensureLocalUploadsDir(): Promise<void> {
  await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
}

function getLocalObjectPath(objectId: string): string {
  // Keep the existing public shape the frontend expects:
  // - stored in DB as a path we can later GET via /api/storage/objects/*
  return `/objects/uploads/${objectId}`;
}

function getLocalUploadUrl(req: Request, objectId: string): string {
  // Relative URL so the frontend can PUT to same-origin.
  return `${req.baseUrl}/storage/uploads/${objectId}`;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    let uploadURL: string | null = null;
    let objectPath: string | null = null;

    // Prefer Replit Object Storage when configured.
    try {
      uploadURL = await objectStorageService.getObjectEntityUploadURL();
      objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    } catch {
      // Local fallback (useful for running on a laptop).
      const objectId = crypto.randomUUID();
      await ensureLocalUploadsDir();
      uploadURL = getLocalUploadUrl(req, objectId);
      objectPath = getLocalObjectPath(objectId);
    }

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/uploads/:id
 *
 * Local upload fallback (non-Replit).
 * The client uploads raw bytes with a Content-Type header.
 */
router.put("/storage/uploads/:id", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res.status(400).json({ error: "Missing upload id" });
      return;
    }

    await ensureLocalUploadsDir();
    const filePath = path.join(LOCAL_UPLOADS_DIR, id);

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    await fs.writeFile(filePath, buffer);

    res.status(200).json({
      ok: true,
      objectPath: getLocalObjectPath(id),
    });
  } catch (error) {
    req.log.error({ err: error }, "Error saving local upload");
    res.status(500).json({ error: "Failed to upload" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Local fallback: /objects/uploads/<id>
    if (wildcardPath.startsWith("uploads/")) {
      const id = wildcardPath.slice("uploads/".length);
      const filePath = path.join(LOCAL_UPLOADS_DIR, id);
      try {
        const data = await fs.readFile(filePath);
        // Best-effort content type; the client supplies Content-Type on upload,
        // but we don't persist it for local mode.
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.status(200).send(data);
        return;
      } catch {
        res.status(404).json({ error: "Object not found" });
        return;
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
