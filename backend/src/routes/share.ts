import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Upstash Redis — persistent share storage ──────────────────────────────────
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Render env vars.
// Falls back to in-memory when not configured (local dev only).
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

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
// ─────────────────────────────────────────────────────────────────────────────

// In-memory fallback for role data when Redis not configured (local dev)
const localStore = new Map<string, any>();

// In-memory file store — PDFs are ephemeral (re-uploadable, not critical for sharing)
const fileStore = new Map<string, Map<string, { buffer: Buffer; mimeType: string }>>();

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

// GET /:token → get role data + available file names
router.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  let role = await redisLoad(token);
  if (!role) role = localStore.get(token) ?? null;
  if (!role) { res.status(404).json({ error: "Share not found or expired" }); return; }
  const files = fileStore.get(token);
  res.json({ role, availableFiles: files ? [...files.keys()] : [] });
});

// PUT /:token → update role data (candidate status changes, new screening results)
router.put("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { role } = req.body;
  if (!role) { res.status(400).json({ error: "role required" }); return; }
  await redisSave(token, role);
  localStore.set(token, role);
  if (!fileStore.has(token)) fileStore.set(token, new Map());
  res.json({ ok: true });
});

// POST /:token/files → upload PDF/doc files
router.post("/:token/files", upload.array("files"), (req: Request, res: Response) => {
  const { token } = req.params;
  if (!fileStore.has(token)) fileStore.set(token, new Map());
  const files = (req.files as Express.Multer.File[]) ?? [];
  const bucket = fileStore.get(token)!;
  for (const f of files) {
    bucket.set(f.originalname, { buffer: f.buffer, mimeType: f.mimetype });
  }
  res.json({ ok: true, stored: files.map(f => f.originalname) });
});

// GET /:token/file/:filename → serve a PDF/doc
router.get("/:token/file/:filename", (req: Request, res: Response) => {
  const { token } = req.params;
  const bucket = fileStore.get(token);
  const fileData = bucket?.get(decodeURIComponent(req.params.filename));
  if (!fileData) { res.status(404).json({ error: "File not found" }); return; }
  res.setHeader("Content-Type", fileData.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${req.params.filename}"`);
  res.send(fileData.buffer);
});

export { router as shareRouter };
