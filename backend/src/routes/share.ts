import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function slugify(text: string): string {
  return (text || "role")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 32) || "role";
}

interface ShareEntry {
  role: any;
  files: Map<string, { buffer: Buffer; mimeType: string }>;
  createdAt: number;
}

const shareStore = new Map<string, ShareEntry>();

// POST / → create share, return token
router.post("/", (req: Request, res: Response) => {
  const { role } = req.body;
  if (!role) { res.status(400).json({ error: "role required" }); return; }
  const suffix = crypto.randomBytes(3).toString("hex");
  const token = `${slugify(role.title || "role")}-${suffix}`;
  shareStore.set(token, { role, files: new Map(), createdAt: Date.now() });
  res.json({ token });
});

// GET /:token → get role data + available file names
router.get("/:token", (req: Request, res: Response) => {
  const entry = shareStore.get(req.params.token);
  if (!entry) { res.status(404).json({ error: "Share not found" }); return; }
  res.json({ role: entry.role, availableFiles: [...entry.files.keys()] });
});

// PUT /:token → update role data (candidate changes, new screening results)
router.put("/:token", (req: Request, res: Response) => {
  const entry = shareStore.get(req.params.token);
  if (!entry) { res.status(404).json({ error: "Share not found" }); return; }
  const { role } = req.body;
  if (!role) { res.status(400).json({ error: "role required" }); return; }
  entry.role = role;
  res.json({ ok: true });
});

// POST /:token/files → upload PDF/doc files
router.post("/:token/files", upload.array("files"), (req: Request, res: Response) => {
  const entry = shareStore.get(req.params.token);
  if (!entry) { res.status(404).json({ error: "Share not found" }); return; }
  const files = (req.files as Express.Multer.File[]) ?? [];
  for (const f of files) {
    entry.files.set(f.originalname, { buffer: f.buffer, mimeType: f.mimetype });
  }
  res.json({ ok: true, stored: files.map(f => f.originalname) });
});

// GET /:token/file/:filename → serve a PDF/doc
router.get("/:token/file/:filename", (req: Request, res: Response) => {
  const entry = shareStore.get(req.params.token);
  if (!entry) { res.status(404).json({ error: "Share not found" }); return; }
  const fileData = entry.files.get(decodeURIComponent(req.params.filename));
  if (!fileData) { res.status(404).json({ error: "File not found" }); return; }
  res.setHeader("Content-Type", fileData.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${req.params.filename}"`);
  res.send(fileData.buffer);
});

export { router as shareRouter };
