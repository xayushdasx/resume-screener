import { Router, Request, Response } from "express";
import multer from "multer";
import OpenAI from "openai";
import mammoth from "mammoth";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── pdfjs-dist (ESM-only) ────────────────────────────────────────────────────
let pdfjsPromise: Promise<any> | null = null;
function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")')() as Promise<any>)
      .then(async m => {
        // Resolve the worker file path using require.resolve (works in CJS/ts-node)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
        m.GlobalWorkerOptions.workerSrc = `file:///${workerPath.replace(/\\/g, "/")}`;
        return m;
      })
      .catch(err => { pdfjsPromise = null; throw err; });
  }
  return pdfjsPromise;
}

// ── Canvas (lazy) ────────────────────────────────────────────────────────────
let canvasLib: any = null;
function getCanvas() {
  if (!canvasLib) canvasLib = require("@napi-rs/canvas");
  return canvasLib;
}

// ── Extract text via pdfjs getTextContent (fallback when pdf-parse fails) ────
async function pdfjsExtractText(buffer: Buffer): Promise<string> {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .map((item: any) => item.str ?? "")
      .filter(Boolean)
      .join(" ");
    if (pageText.trim()) parts.push(pageText.trim());
  }
  return parts.join("\n");
}

// ── Extract embedded images from a PDF page (fallback for render failures) ───
async function extractEmbeddedImages(page: any): Promise<string[]> {
  const { createCanvas } = getCanvas();
  const PAINT_IMAGE = 85; // pdfjs OPS.paintImageXObject

  const opList = await page.getOperatorList();
  const imageNames: string[] = [];
  for (let j = 0; j < opList.fnArray.length; j++) {
    if (opList.fnArray[j] === PAINT_IMAGE) {
      const name = opList.argsArray[j]?.[0];
      if (name && typeof name === "string" && !imageNames.includes(name)) imageNames.push(name);
    }
  }

  // Load all images, pick only the largest (resume content) — ignores profile photos/thumbnails
  const loaded: { name: string; img: any }[] = [];
  for (const name of imageNames) {
    try {
      const img: any = await new Promise<any>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 8000);
        page.objs.get(name, (data: any) => { clearTimeout(t); resolve(data); });
      });
      if (img?.data && img.width > 0 && img.height > 0) loaded.push({ name, img });
    } catch { /* skip */ }
  }

  // Keep only the largest image per page (avoids sending profile photos separately)
  loaded.sort((a, b) => (b.img.width * b.img.height) - (a.img.width * a.img.height));
  const toRender = loaded.slice(0, 1);

  const results: string[] = [];
  for (const { img } of toRender) {
    try {
      const pixelCount = img.width * img.height;
      const rgba = new Uint8ClampedArray(pixelCount * 4);
      const src = img.data;

      if (src.length >= pixelCount * 4) {
        rgba.set(src.slice(0, pixelCount * 4));
      } else if (src.length >= pixelCount * 3) {
        for (let k = 0; k < pixelCount; k++) {
          rgba[k*4]=src[k*3]; rgba[k*4+1]=src[k*3+1]; rgba[k*4+2]=src[k*3+2]; rgba[k*4+3]=255;
        }
      } else if (src.length >= pixelCount) {
        for (let k = 0; k < pixelCount; k++) {
          rgba[k*4]=src[k]; rgba[k*4+1]=src[k]; rgba[k*4+2]=src[k]; rgba[k*4+3]=255;
        }
      } else continue;

      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      const id = ctx.createImageData(img.width, img.height);
      id.data.set(rgba);
      ctx.putImageData(id, 0, 0);
      results.push(canvas.toBuffer("image/png").toString("base64"));
    } catch { /* skip */ }
  }
  return results;
}

// ── Render PDF pages → base64 PNGs ───────────────────────────────────────────
async function renderPdfToImages(buffer: Buffer, maxPages = 4): Promise<string[]> {
  const pdfjs = await getPdfjs();
  const { createCanvas } = getCanvas();

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const images: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const w = Math.ceil(viewport.width);
    const h = Math.ceil(viewport.height);
    let done = false;

    // Attempt 1: full render
    if (!done) {
      try {
        const canvas = createCanvas(w, h);
        const canvasContext = canvas.getContext("2d");
        await page.render({ canvas: null, canvasContext, viewport }).promise;
        const png = canvas.toBuffer("image/png");
        console.log(`[parse-pdf] Page ${i} rendered: ${png.length} bytes`);
        images.push(png.toString("base64"));
        done = true;
      } catch (e: any) {
        console.warn(`[parse-pdf] Page ${i} render failed (${e?.message?.slice(0,80)}), trying no-annotation render…`);
      }
    }

    // Attempt 2: render without annotations (annotation parsing often causes failures)
    if (!done) {
      try {
        const canvas = createCanvas(w, h);
        const canvasContext = canvas.getContext("2d");
        await page.render({ canvas: null, canvasContext, viewport, annotationMode: 0 }).promise;
        const png = canvas.toBuffer("image/png");
        console.log(`[parse-pdf] Page ${i} rendered (no annotations): ${png.length} bytes`);
        images.push(png.toString("base64"));
        done = true;
      } catch (e: any) {
        console.warn(`[parse-pdf] Page ${i} no-annotation render failed (${e?.message?.slice(0,80)}), trying image extraction…`);
      }
    }

    // Attempt 3: extract embedded images directly (works for scanned/image PDFs)
    if (!done) {
      try {
        const extracted = await extractEmbeddedImages(page);
        if (extracted.length > 0) {
          console.log(`[parse-pdf] Page ${i}: extracted ${extracted.length} embedded image(s)`);
          images.push(...extracted);
          done = true;
        } else {
          console.warn(`[parse-pdf] Page ${i}: no embedded images found`);
        }
      } catch (e: any) {
        console.warn(`[parse-pdf] Page ${i} image extraction failed: ${e?.message?.slice(0,80)}`);
      }
    }
  }

  return images;
}

// ── OCR via OpenAI Vision ────────────────────────────────────────────────────
async function ocrWithVision(images: string[]): Promise<string> {
  const content: any[] = [
    {
      type: "text",
      text: "Extract all text from this resume image exactly as it appears. Preserve structure — sections, bullet points, dates, company names, job titles. Return plain text only, no commentary.",
    },
    ...images.map(b64 => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${b64}`, detail: "high" },
    })),
  ];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 120_000);

  try {
    const resp = await getOpenAI().chat.completions.create(
      { model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 4096 },
      { signal: abort.signal }
    );
    return resp.choices[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Hyperlink extraction ─────────────────────────────────────────────────────
interface HyperlinkEntry { anchor: string; url: string; }

async function extractHyperlinks(buffer: Buffer): Promise<HyperlinkEntry[]> {
  const links: HyperlinkEntry[] = [];
  try {
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      disableAutoFetch: true,
      disableStream: true,
    }).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const [textContent, annotations] = await Promise.all([
        page.getTextContent(),
        page.getAnnotations(),
      ]);
      const linkAnns = (annotations as any[]).filter(
        a => a.subtype === "Link" && (a.url || a.unsafeUrl)
      );
      for (const ann of linkAnns) {
        const url: string = ann.url || ann.unsafeUrl;
        if (!url || url.startsWith("mailto:")) continue;
        const [ax1, ay1, ax2, ay2] = ann.rect as number[];
        const overlapping: string[] = [];
        for (const item of textContent.items as any[]) {
          if (!item.str?.trim()) continue;
          const [, , , d, x, y] = item.transform as number[];
          const h = item.height || Math.abs(d) || 10;
          const w = item.width || 0;
          if (x < ax2 + 2 && x + w > ax1 - 2 && y < ay2 + 2 && y + h > ay1 - 2) {
            overlapping.push(item.str.trim());
          }
        }
        const anchor = overlapping.join(" ").trim() || url;
        if (!links.some(l => l.url === url)) links.push({ anchor, url });
      }
    }
  } catch { /* optional */ }
  return links;
}

// ── Detect file type ──────────────────────────────────────────────────────────
function fileType(originalname: string, mimetype: string): "pdf" | "docx" | "doc" | "unknown" {
  const ext = (originalname ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || mimetype === "application/pdf") return "pdf";
  if (ext === "docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "doc" || mimetype === "application/msword") return "doc";
  return "unknown";
}

// ── Route ────────────────────────────────────────────────────────────────────
router.post("/parse-pdf", upload.single("pdf"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const fname = req.file.originalname ?? "file";
    const type = fileType(fname, req.file.mimetype ?? "");
    console.log(`[parse-pdf] ${fname} — type=${type}, size=${req.file.size} bytes`);

    // ── Word documents ────────────────────────────────────────────────────
    if (type === "docx" || type === "doc") {
      try {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        const text = result.value.trim();
        if (!text) return res.status(422).json({ error: "Could not extract text from Word document" });
        console.log(`[parse-pdf] Word doc OK, ${text.length} chars`);
        return res.json({ text });
      } catch (err: any) {
        console.error("[parse-pdf] Word parse error:", err?.message ?? err);
        return res.status(422).json({ error: "Failed to parse Word document. Try saving as PDF and re-uploading." });
      }
    }

    if (type === "unknown") {
      return res.status(422).json({ error: `Unsupported file type: ${fname}. Upload PDF or Word (.docx) files.` });
    }

    // ── PDF: Layer 1 — pdf-parse ──────────────────────────────────────────
    let text = "";
    let meaningful = 0;

    try {
      const parseResult = await pdfParse(req.file.buffer) as { text: string };
      text = parseResult?.text?.trim() ?? "";
      meaningful = text.replace(/\s+/g, "").length;
      console.log(`[parse-pdf] pdf-parse: ${meaningful} meaningful chars`);
    } catch (pdfParseErr: any) {
      console.warn(`[parse-pdf] pdf-parse threw: ${pdfParseErr?.message} — falling through`);
    }

    // ── PDF: Layer 2 — pdfjs getTextContent (styled/designed PDFs) ───────
    if (meaningful < 200) {
      console.log(`[parse-pdf] Low text from pdf-parse (${meaningful}), trying pdfjs text extraction…`);
      try {
        const pdfjsText = await pdfjsExtractText(req.file.buffer);
        const pdfjsMeaningful = pdfjsText.replace(/\s+/g, "").length;
        console.log(`[parse-pdf] pdfjs text extraction: ${pdfjsMeaningful} meaningful chars`);
        if (pdfjsMeaningful > meaningful) {
          text = pdfjsText;
          meaningful = pdfjsMeaningful;
        }
      } catch (pdfjsErr: any) {
        console.warn(`[parse-pdf] pdfjs text extraction threw: ${pdfjsErr?.message}`);
      }
    }

    // ── PDF: Layer 3 — Vision OCR (image-based / scan PDFs) ──────────────
    if (meaningful < 100) {
      console.log(`[parse-pdf] Still low text (${meaningful}), running Vision OCR…`);
      try {
        console.log(`[parse-pdf] Rendering PDF pages to images…`);
        const images = await renderPdfToImages(req.file.buffer);
        console.log(`[parse-pdf] Rendered ${images.length} image(s) for OCR`);
        const capped = images.slice(0, 3);
        console.log(`[parse-pdf] Sending ${capped.length} image(s) to Vision OCR (gpt-4o)…`);
        if (capped.length === 0) return res.status(422).json({ error: "Could not render PDF pages for OCR" });
        text = await ocrWithVision(capped);
        console.log(`[parse-pdf] OCR result: ${text.length} chars`);
      } catch (ocrErr: any) {
        console.error("[parse-pdf] OCR failed:", ocrErr?.message ?? ocrErr);
        return res.status(422).json({ error: "Image-based PDF — OCR failed. Try a text-based PDF or Word document." });
      }
    }

    if (!text) return res.status(422).json({ error: "Could not extract text from PDF" });

    // ── Append hyperlinks ─────────────────────────────────────────────────
    const links = await extractHyperlinks(req.file.buffer).catch(() => [] as HyperlinkEntry[]);
    if (links.length > 0) {
      const linkLines = links.map(l => `"${l.anchor}" → ${l.url}`).join("\n");
      text += `\n\n---EMBEDDED HYPERLINKS---\n${linkLines}`;
    }

    console.log(`[parse-pdf] ${fname} done — ${text.length} chars, ${links.length} links`);
    return res.json({ text });

  } catch (error: any) {
    console.error("[parse-pdf] Unhandled error:", error?.message ?? error);
    return res.status(500).json({ error: `Failed to parse ${req.file?.originalname ?? "file"}. Ensure it is a valid, non-encrypted PDF or Word document.` });
  }
});

export { router as parsePdfRouter };
