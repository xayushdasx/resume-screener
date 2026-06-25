import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { generatePromptRouter } from "./routes/generatePrompt";
import { parsePdfRouter } from "./routes/parsePdf";
import { mockFlowRouter } from "./routes/mockFlow";
import { getCostLog, clearCostLog } from "./costTracker";
import { shareRouter } from "./routes/share";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT"],
  allowedHeaders: ["Content-Type"],
}));

// ── Body size limits ─────────────────────────────────────────────────────────
app.use(express.json({ limit: "100mb" }));  // large pools: 500 resumes × ~100kb text each

// ── Rate limiting ────────────────────────────────────────────────────────────
// Expensive LLM routes — 300 requests per 15 min per IP
const llmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait and try again." },
});

// PDF upload — 2000 per 15 min (large pools must all parse)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads. Please wait and try again." },
});

app.use("/api/generate-prompt", llmLimiter);
app.use("/api/build-evaluator-prompt", llmLimiter);
app.use("/api/recalibrate-prompt", llmLimiter);
app.use("/api/bulk-screen-stream", llmLimiter);
app.use("/api/screen-and-sample", llmLimiter);
app.use("/api/bulk-eval-stream", llmLimiter);
app.use("/api/rank-candidates-stream", llmLimiter);
app.use("/api/compress-eval-prompt", llmLimiter);
app.use("/api/parse-pdf", uploadLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", generatePromptRouter);
app.use("/api", parsePdfRouter);
app.use("/api", mockFlowRouter);
app.use("/api/share", shareRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Cost dashboard ────────────────────────────────────────────────────────────
app.get("/costs/data", (_req, res) => res.json(getCostLog()));
app.post("/costs/clear", (_req, res) => { clearCostLog(); res.json({ ok: true }); });

app.get("/costs", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cost Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #1e293b; font-size: 13px; }
  header { background: #0f172a; color: #f1f5f9; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 15px; font-weight: 600; letter-spacing: .3px; }
  header span { font-size: 11px; color: #94a3b8; }
  .wrap { padding: 24px; max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .card-head { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
  .card-head h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 9px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .group-header td { background: #f1f5f9; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #475569; padding: 6px 14px; }
  .subtotal td { background: #f8fafc; font-weight: 600; color: #334155; font-size: 12px; }
  .subtotal td:last-child { color: #0f766e; }
  .grand-total td { background: #0f172a; color: #f8fafc; font-weight: 700; font-size: 13px; }
  .grand-total td:last-child { color: #34d399; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .badge-step1  { background: #dbeafe; color: #1d4ed8; }
  .badge-taste  { background: #fef3c7; color: #92400e; }
  .badge-full   { background: #dcfce7; color: #166534; }
  .badge-other  { background: #f1f5f9; color: #475569; }
  .mono { font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; }
  .cost { font-family: "SF Mono", monospace; font-size: 12px; color: #0f766e; font-weight: 600; }
  .dim { color: #94a3b8; font-size: 11px; }
  .actions { display: flex; gap: 8px; align-items: center; }
  button { padding: 6px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; color: #374151; font-size: 12px; font-weight: 600; cursor: pointer; }
  button:hover { background: #f1f5f9; }
  button.danger { border-color: #fca5a5; color: #dc2626; }
  button.danger:hover { background: #fef2f2; }
  .empty { padding: 40px; text-align: center; color: #94a3b8; font-size: 13px; }
  .ts { color: #94a3b8; font-size: 11px; font-family: monospace; }
  #status { font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<header>
  <h1>LLM Cost Dashboard</h1>
  <div class="actions">
    <span id="status">Loading…</span>
    <button onclick="load()">Refresh</button>
    <button class="danger" onclick="clearLog()">Clear</button>
  </div>
</header>
<div class="wrap">
  <div class="card" id="main-card">
    <div class="card-head">
      <h2>Cost Log</h2>
      <span id="last-updated" class="dim"></span>
    </div>
    <div id="table-wrap"><div class="empty">No data yet. Run some evaluations first.</div></div>
  </div>
</div>

<script>
function groupBadge(group) {
  const g = group.toLowerCase();
  if (g.includes('step 1') || g.includes('setup') || g.includes('criteria') || g.includes('jd') || g.includes('recalib')) return 'badge-step1';
  if (g.includes('taste') || g.includes('calibration')) return 'badge-taste';
  if (g.includes('full pool') || g.includes('screen all')) return 'badge-full';
  return 'badge-other';
}

function fmt(n) { return n.toLocaleString(); }
function fmtCost(n) { return '$' + n.toFixed(4); }
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function render(entries) {
  if (!entries.length) {
    document.getElementById('table-wrap').innerHTML = '<div class="empty">No data yet. Run some evaluations first.</div>';
    return;
  }

  // Group entries
  const groups = {};
  for (const e of entries) {
    if (!groups[e.group]) groups[e.group] = [];
    groups[e.group].push(e);
  }

  let grandIn = 0, grandOut = 0, grandCost = 0;

  let html = '<table>';
  html += '<thead><tr><th>#</th><th>Time</th><th>Label</th><th>Group</th><th>Model</th><th>Items</th><th style="text-align:right">Input</th><th style="text-align:right">Output</th><th style="text-align:right">Cost</th></tr></thead>';
  html += '<tbody>';

  for (const [group, rows] of Object.entries(groups)) {
    const gRows = rows;
    html += '<tr class="group-header"><td colspan="9">' + group + '</td></tr>';

    let subIn = 0, subOut = 0, subCost = 0;
    for (const e of gRows) {
      subIn   += e.input_tokens;
      subOut  += e.output_tokens;
      subCost += e.cost_usd;
      html += '<tr>';
      html += '<td class="dim">' + e.id + '</td>';
      html += '<td class="ts">' + fmtTime(e.ts) + '</td>';
      html += '<td>' + e.label + '</td>';
      html += '<td><span class="badge ' + groupBadge(e.group) + '">' + e.group + '</span></td>';
      html += '<td class="mono">' + e.model + '</td>';
      html += '<td class="mono">' + (e.count > 1 ? e.count : '—') + '</td>';
      html += '<td class="mono" style="text-align:right">' + fmt(e.input_tokens) + '</td>';
      html += '<td class="mono" style="text-align:right">' + fmt(e.output_tokens) + '</td>';
      html += '<td class="cost" style="text-align:right">' + fmtCost(e.cost_usd) + '</td>';
      html += '</tr>';
    }

    grandIn += subIn; grandOut += subOut; grandCost += subCost;
    html += '<tr class="subtotal">';
    html += '<td colspan="6" style="text-align:right;padding-right:8px">Subtotal — ' + group + '</td>';
    html += '<td class="mono" style="text-align:right">' + fmt(subIn) + '</td>';
    html += '<td class="mono" style="text-align:right">' + fmt(subOut) + '</td>';
    html += '<td class="cost" style="text-align:right">' + fmtCost(subCost) + '</td>';
    html += '</tr>';
  }

  html += '<tr class="grand-total">';
  html += '<td colspan="6" style="text-align:right;padding-right:8px">TOTAL</td>';
  html += '<td style="text-align:right;font-family:monospace">' + fmt(grandIn) + '</td>';
  html += '<td style="text-align:right;font-family:monospace">' + fmt(grandOut) + '</td>';
  html += '<td style="text-align:right">' + fmtCost(grandCost) + '</td>';
  html += '</tr>';

  html += '</tbody></table>';
  document.getElementById('table-wrap').innerHTML = html;
}

async function load() {
  try {
    const r = await fetch('/costs/data');
    const data = await r.json();
    render(data);
    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    document.getElementById('status').textContent = data.length + ' entries';
  } catch(e) {
    document.getElementById('status').textContent = 'Error loading';
  }
}

async function clearLog() {
  if (!confirm('Clear all cost data?')) return;
  await fetch('/costs/clear', { method: 'POST' });
  load();
}

load();
setInterval(load, 4000);
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
