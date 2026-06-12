// ── Cost Tracker ──────────────────────────────────────────────────────────────
// All LLM routes call trackCost(). The /costs dashboard reads getCostLog().

export interface CostEntry {
  id: number;
  ts: Date;
  label: string;
  group: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  count: number;          // number of items (resumes) for batch calls, 1 for single
}

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },   // $ per 1M tokens
  "gpt-4o-mini":  { input: 0.15, output: 0.60  },
};

export function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { input: 0.40, output: 1.60 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

let log: CostEntry[] = [];
let nextId = 1;

export function trackCost(
  label: string,
  group: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  count = 1
): void {
  const cost_usd = calcCost(model, inputTokens, outputTokens);
  log.push({ id: nextId++, ts: new Date(), label, group, model, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd, count });
}

export function getCostLog(): CostEntry[] { return log; }
export function clearCostLog(): void { log = []; nextId = 1; }
