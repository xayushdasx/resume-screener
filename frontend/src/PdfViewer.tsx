import React, { useEffect, useRef, useState } from "react";

// Lazy-load pdfjs-dist so a load failure can't crash the whole app
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then(lib => {
      // Use Vite's ?url import to get the worker URL reliably
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).href;
      return lib;
    }).catch(err => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

interface LinkOverlay {
  url: string;
  left: string;
  top: string;
  width: string;
  height: string;
}

interface PdfPageProps {
  pdf: Awaited<ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>>["promise"] extends Promise<infer T> ? T : never;
  pageNum: number;
}

function PdfPage({ pdf, pageNum }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [links, setLinks] = useState<LinkOverlay[]>([]);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const SCALE = 1.5;

    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: SCALE });

        const canvas = canvasRef.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
        if (cancelled) return;

        const annotations = await page.getAnnotations();
        const pageLinks: LinkOverlay[] = [];

        for (const ann of annotations as any[]) {
          const rawUrl: string | undefined = ann.url || ann.unsafeUrl;
          if (ann.subtype !== "Link" || !rawUrl) continue;

          const [ax1, ay1, ax2, ay2]: number[] = ann.rect;
          const pt1 = viewport.convertToViewportPoint(ax1, ay2);
          const pt2 = viewport.convertToViewportPoint(ax2, ay1);

          const left = Math.min(pt1[0], pt2[0]);
          const top = Math.min(pt1[1], pt2[1]);
          const w = Math.abs(pt2[0] - pt1[0]);
          const h = Math.abs(pt2[1] - pt1[1]);

          pageLinks.push({
            url: rawUrl,
            left: `${(left / viewport.width) * 100}%`,
            top: `${(top / viewport.height) * 100}%`,
            width: `${(w / viewport.width) * 100}%`,
            height: `${(h / viewport.height) * 100}%`,
          });
        }

        if (!cancelled) setLinks(pageLinks);
      } catch { /* silently skip broken pages */ }
    })();

    return () => { cancelled = true; };
  }, [pdf, pageNum]);

  return (
    <div style={{ position: "relative", width: "100%", marginBottom: 2 }}>
      <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: "absolute",
            left: link.left,
            top: link.top,
            width: link.width,
            height: link.height,
            cursor: "pointer",
          }}
          onClick={e => {
            e.preventDefault();
            window.open(link.url, "_blank", "noopener,noreferrer");
          }}
        />
      ))}
    </div>
  );
}

interface PdfViewerProps {
  url: string | null;
  className?: string;
  style?: React.CSSProperties;
}

type PdfDoc = Awaited<ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>>["promise"] extends Promise<infer T> ? T : never;

export function PdfViewer({ url, className, style }: PdfViewerProps) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!url) { setPdf(null); setNumPages(0); setState("idle"); return; }
    setState("loading");
    let cancelled = false;

    getPdfjs()
      .then(lib => lib.getDocument(url).promise)
      .then(doc => {
        if (cancelled) return;
        setPdf(doc as any);
        setNumPages(doc.numPages);
        setState("idle");
      })
      .catch(() => { if (!cancelled) setState("error"); });

    return () => { cancelled = true; };
  }, [url]);

  const placeholder = (msg: string) => (
    <div className={className} style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <span style={{ fontSize: 12, color: "#94a3b8" }}>{msg}</span>
    </div>
  );

  if (!url) return placeholder("PDF preview unavailable");
  if (state === "loading") return placeholder("Loading…");
  if (state === "error") return placeholder("Could not load PDF");
  if (!pdf) return placeholder("PDF preview unavailable");

  return (
    <div className={className} style={{ ...style, overflowY: "auto", background: "#525659", padding: "8px 0" }}>
      {Array.from({ length: numPages }, (_, i) => (
        <PdfPage key={`${url}-${i}`} pdf={pdf} pageNum={i + 1} />
      ))}
    </div>
  );
}
