import type { GeneratePromptResponse, TestResumeResponse, ExtractedParams } from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Server returned empty response (status ${res.status})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from server (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function generateJd(
  roleName: string,
  statement: string
): Promise<{ jd?: string; error?: string }> {
  const res = await fetch(`${BASE}/generate-jd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_name: roleName, statement }),
  });
  return safeJson(res);
}

export async function generatePrompt(
  jd: string,
  roleTitleOverride?: string
): Promise<GeneratePromptResponse> {
  const res = await fetch(`${BASE}/generate-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd, role_title_override: roleTitleOverride }),
  });
  return safeJson(res);
}

export async function testResume(
  compressorPrompt: string,
  evaluatorPrompt: string,
  resumeText: string
): Promise<TestResumeResponse> {
  const res = await fetch(`${BASE}/test-resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compressor_prompt: compressorPrompt,
      evaluator_prompt: evaluatorPrompt,
      resume_text: resumeText,
    }),
  });
  return safeJson(res);
}

export async function parseEvaluatorPrompt(
  evaluatorPrompt: string
): Promise<{ extracted_params?: ExtractedParams; error?: string; raw_response?: string }> {
  const res = await fetch(`${BASE}/parse-evaluator-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluator_prompt: evaluatorPrompt }),
  });
  return safeJson(res);
}

export async function uploadPdf(file: File, timeoutMs = 150000): Promise<{ text?: string; error?: string }> {
  const formData = new FormData();
  formData.append("pdf", file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}/parse-pdf`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    return safeJson(res);
  } catch (e: any) {
    if (e?.name === "AbortError") return { error: `Timed out parsing ${file.name}` };
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateClarifyingQuestions(
  payload: {
    criteria: {
      p0_text: string;
      p1_text: string;
      dealbreakers: string;
      role_title: string;
      seniority: string;
      min_experience_months: number;
    };
    jd_context: string;
    source_context?: string;
    source_role?: string;
    role_family?: string;
    focus_field?: "p0" | "p1" | "dealbreakers";
  }
): Promise<{ needs_clarification: boolean; questions: Array<{ id: string; field: "p0" | "p1" | "dealbreakers"; question: string; context: string; options: string[] }>; error?: string }> {
  const res = await fetch(`${BASE}/generate-clarifying-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload.criteria,
      jd_context: payload.jd_context,
      source_context: payload.source_context,
      source_role: payload.source_role,
      role_family: payload.role_family,
      focus_field: payload.focus_field,
    }),
  });
  return safeJson(res);
}

export async function checkCriteriaVagueness(
  field: "P0" | "P1",
  text: string,
  context?: { role_title?: string; seniority?: string; min_experience_months?: number; jd_context?: string }
): Promise<{ is_vague: boolean; issue: string | null; hint: string | null; vague_elements?: string[]; example_rewrite?: string | null; error?: string }> {
  const res = await fetch(`${BASE}/check-criteria-vagueness`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, text, ...context }),
  });
  return safeJson(res);
}

export async function recalibratePrompt(
  evaluatorPrompt: string,
  feedback: Array<{ filename: string; decision: string; reasoning: string[]; hr_agrees: boolean; hr_direction?: "higher" | "lower" | null; hr_target?: "P0" | "P1" | "Reject" | "Baseline"; reject_reason?: { category: string; description: string } }>
): Promise<{ new_evaluator_prompt?: string; error?: string }> {
  const res = await fetch(`${BASE}/recalibrate-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluator_prompt: evaluatorPrompt, feedback }),
  });
  return safeJson(res);
}

export async function refineEvaluatorPrompt(
  evaluatorPrompt: string,
  parameterChanges: object
): Promise<{ evaluator_prompt?: string; error?: string }> {
  const res = await fetch(`${BASE}/refine-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluator_prompt: evaluatorPrompt, parameter_changes: parameterChanges }),
  });
  return safeJson(res);
}

export async function* bulkScreenStream(
  resumes: { text: string; filename: string }[],
  compressorPrompt: string,
  evaluatorPrompt: string,
  label?: string
): AsyncGenerator<any> {
  const res = await fetch(`${BASE}/bulk-screen-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumes, compressor_prompt: compressorPrompt, evaluator_prompt: evaluatorPrompt, label }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || "Bulk screen stream failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

export async function* screenAndSampleStream(
  resumes: { text: string; filename: string }[],
  compressorPrompt: string,
  evaluatorPrompt: string,
  sampleSize = 6
): AsyncGenerator<any> {
  const res = await fetch(`${BASE}/screen-and-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resumes,
      compressor_prompt: compressorPrompt,
      evaluator_prompt: evaluatorPrompt,
      sample_size: sampleSize,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || "Screen and sample stream failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

export async function buildEvaluatorFromCriteria(
  criteria: object
): Promise<{ evaluator_prompt?: string; error?: string }> {
  const res = await fetch(`${BASE}/build-evaluator-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criteria }),
  });
  return safeJson(res);
}

export interface CompressedView {
  must_have: string[];
  p0: string[];
  p1: string[];
  reject: string[];
  background: string[];
}

export async function compressEvalPrompt(
  evaluatorPrompt: string
): Promise<CompressedView> {
  const res = await fetch(`${BASE}/compress-eval-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluator_prompt: evaluatorPrompt }),
  });
  const data = await safeJson(res);
  return {
    must_have: data.must_have ?? [],
    p0: data.p0 ?? [],
    p1: data.p1 ?? [],
    reject: data.reject ?? [],
    background: data.background ?? [],
  };
}

export async function dynamicTweakPrompt(
  evaluatorPrompt: string,
  issueCategory: string,
  issueDescription: string
): Promise<{ evaluator_prompt?: string; error?: string }> {
  const res = await fetch(`${BASE}/dynamic-tweak-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evaluator_prompt: evaluatorPrompt, issue_category: issueCategory, issue_description: issueDescription }),
  });
  return safeJson(res);
}

// ── Share API ─────────────────────────────────────────────────────────────────

const SHARE_BASE = `${BASE}/share`;

export async function createShare(role: object): Promise<{ token: string }> {
  const res = await fetch(SHARE_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return safeJson(res);
}

export async function getShare(token: string): Promise<{ role: any; availableFiles: string[] }> {
  const res = await fetch(`${SHARE_BASE}/${token}`);
  return safeJson(res);
}

export async function updateShare(token: string, role: object): Promise<void> {
  await fetch(`${SHARE_BASE}/${token}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function uploadShareFiles(token: string, files: File[]): Promise<void> {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f, f.name));
  await fetch(`${SHARE_BASE}/${token}/files`, { method: "POST", body: fd });
}

export function getShareFileUrl(token: string, filename: string): string {
  return `${SHARE_BASE}/${token}/file/${encodeURIComponent(filename)}`;
}

export async function* bulkEvalStream(
  candidates: { filename: string; name: string; email: string | null; phone: string | null; signal_json: object }[],
  evaluatorPrompt: string
): AsyncGenerator<any> {
  const res = await fetch(`${BASE}/bulk-eval-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, evaluator_prompt: evaluatorPrompt }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || "Bulk eval stream failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}
