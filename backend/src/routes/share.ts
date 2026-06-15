import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Upstash Redis — persistent share storage ──────────────────────────────────
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_FILE_REDIS_BYTES = 500 * 1024;       // 500 KB — safe under Upstash 1 MB per-request limit

async function redisExec(cmd: (string | number)[]): Promise<any> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([cmd]),
    });
    const [result] = (await res.json()) as any[];
    return result?.result ?? null;
  } catch (e) {
    console.error("[redis]", e);
    return null;
  }
}

async function redisSave(token: string, role: any): Promise<void> {
  await redisExec(["SET", `share:${token}`, JSON.stringify(role), "EX", SHARE_TTL_SECONDS]);
}

async function redisLoad(token: string): Promise<any | null> {
  const raw = await redisExec(["GET", `share:${token}`]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Files stored as "mimeType:base64data" — only for files ≤ 500 KB
async function redisSetFile(token: string, filename: string, mimeType: string, buf: Buffer): Promise<void> {
  const value = `${mimeType}:${buf.toString("base64")}`;
  await redisExec(["SET", `file:${token}:${encodeURIComponent(filename)}`, value, "EX", SHARE_TTL_SECONDS]);
}

async function redisGetFile(token: string, filename: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const raw = await redisExec(["GET", `file:${token}:${encodeURIComponent(filename)}`]);
  if (!raw) return null;
  const idx = (raw as string).indexOf(":");
  if (idx === -1) return null;
  const mimeType = (raw as string).slice(0, idx);
  const buffer = Buffer.from((raw as string).slice(idx + 1), "base64");
  return { buffer, mimeType };
}
// ─────────────────────────────────────────────────────────────────────────────

const localStore = new Map<string, any>();
const fileStore  = new Map<string, Map<string, { buffer: Buffer; mimeType: string }>>();

function slugify(text: string): string {
  return (text || "role")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 32) || "role";
}

// POST / → create share, return token
router.post("/", async (req: Request, res: Response) => {
  const { role } = req.body;
  if (!role) { res.status(400).json({ error: "role required" }); return; }
  const suffix = crypto.randomBytes(3).toString("hex");
  const token = `${slugify(role.title || "role")}-${suffix}`;
  await redisSave(token, role);
  localStore.set(token, role);
  fileStore.set(token, new Map());
  res.json({ token });
});

// GET /:token → get role data
router.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  let role = await redisLoad(token);
  if (!role) role = localStore.get(token) ?? null;
  if (!role) { res.status(404).json({ error: "Share not found or expired" }); return; }
  const files = fileStore.get(token);
  res.json({ role, availableFiles: files ? [...files.keys()] : [] });
});

// PUT /:token → update role data
router.put("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { role } = req.body;
  if (!role) { res.status(400).json({ error: "role required" }); return; }
  await redisSave(token, role);
  localStore.set(token, role);
  if (!fileStore.has(token)) fileStore.set(token, new Map());
  res.json({ ok: true });
});

// POST /:token/files → upload PDF/doc files, persist small ones to Redis
router.post("/:token/files", upload.array("files"), async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!fileStore.has(token)) fileStore.set(token, new Map());
  const files = (req.files as Express.Multer.File[]) ?? [];
  const bucket = fileStore.get(token)!;
  for (const f of files) {
    bucket.set(f.originalname, { buffer: f.buffer, mimeType: f.mimetype });
    if (f.buffer.length <= MAX_FILE_REDIS_BYTES) {
      await redisSetFile(token, f.originalname, f.mimetype, f.buffer);
    }
  }
  res.json({ ok: true, stored: files.map(f => f.originalname) });
});

// GET /:token/file/:filename → serve a PDF/doc, fall back to Redis if not in memory
router.get("/:token/file/:filename", async (req: Request, res: Response) => {
  const { token } = req.params;
  const filename = decodeURIComponent(req.params.filename);
  const bucket = fileStore.get(token);
  let fileData = bucket?.get(filename) ?? null;
  if (!fileData) {
    fileData = await redisGetFile(token, filename);
  }
  if (!fileData) { res.status(404).json({ error: "File not found" }); return; }
  res.setHeader("Content-Type", fileData.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(fileData.buffer);
});

export { router as shareRouter };
