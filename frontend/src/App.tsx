import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PdfViewer } from "./PdfViewer";
import {
  Briefcase, FileText, UploadCloud, CheckCircle, XCircle,
  AlertCircle, Loader2, Target, Check, X, ShieldAlert, Award,
  Pencil, ChevronDown, ChevronUp, Download, Users, ThumbsUp, ThumbsDown, Trash2,
  ArrowRight
} from "lucide-react";
import { RolesList } from "./RolesList";
import { RoleDetail } from "./RoleDetail";
import { SendShortlistModal } from "./SendShortlistModal";
import type { ShortlistEntry } from "./SendShortlistModal";
import { CreateRole } from "./CreateRole";
import type { ATSRole, ATSCandidate } from "./RolesList";
import { generatePrompt, generateJd, uploadPdf, parseEvaluatorPrompt, recalibratePrompt, bulkScreenStream, buildEvaluatorFromCriteria, screenAndSampleStream, bulkEvalStream, dynamicTweakPrompt, compressEvalPrompt, checkCriteriaVagueness, generateClarifyingQuestions, createShare, getShare, updateShare, uploadShareFiles, getShareFileUrl, rankCandidatesStream, checkP0P1Similarity } from "./api";
import type { CompressedView } from "./api";
import type { GeneratePromptResponse, TestResumeResponse } from "./types";
import { idbSaveFile, idbGetFile } from "./idbFiles";

// Suppress experience-threshold text — date calculation is unreliable, hide from UI
const isExpText = (s: string) =>
  /\d+\s*months?|full[- ]?time\s+experience|experience\s+minimum|minimum\s+experience|insufficient\s+experience/i.test(s);

type AppView = "roles" | "create-role" | "role-detail" | "screener";

// ─── Progress bar hook ───────────────────────────────────────────────────────

function useProgressBar() {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTick = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  const advanceTo = useCallback((target: number) => {
    stopTick();
    tickRef.current = setInterval(() => {
      setProgress(prev => {
        const gap = target - prev;
        if (gap <= 0.1) { stopTick(); return target; }
        return prev + Math.max(0.2, gap * 0.06);
      });
    }, 60);
  }, []);

  const reset = useCallback(() => {
    stopTick();
    setProgress(0);
    setLabel("");
  }, []);

  const complete = useCallback(() => {
    stopTick();
    setProgress(100);
  }, []);

  useEffect(() => () => stopTick(), []);

  return { progress, label, setLabel, advanceTo, reset, complete };
}


// ─── Advanced Loading Animations ─────────────────────────────────────────────

function AdvancedLoader({ text = "Analyzing Candidates..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 w-full pointer-events-none">
      <style>
        {`
          @keyframes scanLine {
            0%, 100% { top: 0%; opacity: 0; }
            10%, 90% { opacity: 1; }
            50% { top: 100%; opacity: 1; }
          }
          @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 0 15px rgba(56,189,248,0.2); }
            50% { box-shadow: 0 0 30px rgba(56,189,248,0.6); }
          }
        `}
      </style>
      <div className="relative w-16 h-20 border-2 border-slate-700 bg-slate-900 rounded-lg p-2 overflow-hidden" style={{ animation: "pulseGlow 2s infinite" }}>
        <div className="w-3/4 h-1 bg-slate-700 rounded mb-1.5"></div>
        <div className="w-full h-1 bg-slate-700 rounded mb-1.5"></div>
        <div className="w-5/6 h-1 bg-slate-700 rounded mb-1.5"></div>
        <div className="w-full h-1 bg-slate-700 rounded mb-1.5"></div>
        <div className="w-1/2 h-1 bg-slate-700 rounded mb-1.5"></div>
        
        <div className="absolute left-0 w-full h-[2px] bg-sky-400 shadow-[0_0_8px_#38bdf8]" style={{ animation: 'scanLine 2s ease-in-out infinite' }}></div>
      </div>
      <div className="mt-5 flex flex-col items-center gap-1.5">
        <h3 className="text-sm font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-emerald-500 animate-pulse">
          {text}
        </h3>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-[bounce_1s_infinite_-0.3s]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-[bounce_1s_infinite_-0.15s]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-[bounce_1s_infinite]"></div>
        </div>
      </div>
    </div>
  );
}

function MiniScanner() {
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs font-bold text-sky-600 uppercase tracking-widest animate-pulse">
        Evaluating
      </div>
      <div className="relative w-6 h-8 border border-slate-300 bg-slate-50 rounded p-1 overflow-hidden shadow-inner">
        <div className="w-full h-0.5 bg-slate-200 rounded mb-0.5"></div>
        <div className="w-5/6 h-0.5 bg-slate-200 rounded mb-0.5"></div>
        <div className="w-full h-0.5 bg-slate-200 rounded mb-0.5"></div>
        <div className="absolute left-0 w-full h-[2px] bg-sky-400 shadow-[0_0_6px_#38bdf8]" style={{ animation: 'scanLine 1.5s ease-in-out infinite' }}></div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 w-full px-4 py-8">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="w-full max-w-xs">
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-slate-400 tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-700 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DecisionBadge({ rating }: { rating: "P0" | "P1" | "Reject" }) {
  const config = {
    P0: "bg-emerald-100 text-emerald-800 border-emerald-200",
    P1: "bg-amber-100 text-amber-800 border-amber-200",
    Reject: "bg-red-100 text-red-800 border-red-200",
  }[rating];
  const Icon = { P0: CheckCircle, P1: AlertCircle, Reject: XCircle }[rating];
  const label = { P0: "P0: Strong Hire", P1: "P1: Interview", Reject: "Reject" }[rating];
  return (
    <span className={`flex items-center gap-2 border rounded-full px-3 py-1 text-xs font-bold ${config}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

type TasteResult = {
  filename: string;
  name: string;
  result: TestResumeResponse | null;
  error?: string;
  sampleCategory?: string;
};

type CandidateSignal = {
  filename: string;
  name: string;
  email: string | null;
  phone: string | null;
  signal_json: object;
  college_name?: string;
  college_tier?: string;
};

function sampleCategoryLabel(category?: string) {
  const labels: Record<string, string> = {
    passed_all_parameters: "Passed all parameters",
    edge_case_passed: "Edge case pass",
    passed_many_parameters: "Strong middle",
    borderline_reject: "Borderline reject",
    failed_some_parameters: "Missed some parameters",
    clearly_bad_fit: "Clearly weak fit",
  };
  return category ? labels[category] ?? category.replace(/_/g, " ") : null;
}

function toTasteResult(data: any): TasteResult {
  const filename = data.filename ?? data.name ?? "Candidate";
  const name = data.name ?? data.filename ?? "Candidate";
  if (data.rating === "Error") {
    return {
      filename,
      name,
      result: null,
      error: data.reject_reason ?? "Processing failed",
      sampleCategory: data.sample_category,
    };
  }

  return {
    filename,
    name,
    sampleCategory: data.sample_category,
    result: {
      signal_json: data.signal_json ?? {},
      rating_result: {
        rating: data.rating ?? "Reject",
        score: data.score ?? null,
        reject_reason: data.reject_reason ?? null,
        reasoning: data.reasoning ?? [],
        concerns: data.concerns ?? [],
      },
    },
  };
}

// ─── Criteria Panel Types + Helpers ──────────────────────────────────────────

interface CriteriaState {
  role_title: string;
  seniority: string;
  min_experience_months: number;
  min_internship_months?: number | "same_as_fulltime" | "not_applicable";
  p0_text: string;
  p1_text: string;
  dealbreakers: string;
  skills: string[];
  education_pedigree: string[];
  company_pedigree: string[];
  p0_education_pedigree: string[];
  p0_company_pedigree: string[];
  p0_education_tier2_skills?: string;
  p1_education_pedigree: string[];
  p1_company_pedigree: string[];
  non_work_weight: "ignore" | "weak_signal" | "partial" | "full";
  adjacent_roles_policy?: string;
  seniority_mismatch_policy?: string;
  experience_surplus_policy?: string;
}

function formatExpMonths(m: number): string {
  if (m === 0) return "No minimum";
  if (m < 12) return `${m} month${m === 1 ? "" : "s"}`;
  if (m === 12) return "1 year";
  if (m === 18) return "1.5 years";
  if (m % 12 === 0) return `${m / 12} years`;
  return `${m} months`;
}

const EXP_OPTIONS = [0, 6, 12, 18, 24, 36, 48, 60];

interface RoleContextQuestion {
  id: string;
  field: "adjacent_roles_policy" | "seniority_mismatch_policy" | "experience_surplus_policy";
  label: string;
  staticContext?: string;
  consequence: string;
  rejectValue: string;
  rejectRequiresInput?: boolean; // when true, Reject shows a number input instead of storing rejectValue immediately
}

const ROLE_CONTEXT_QUESTIONS: RoleContextQuestion[] = [
  {
    id: "adjacent_roles",
    field: "adjacent_roles_policy",
    label: "Adjacent roles",
    // context is dynamic — getAdjacentRoleExamples(roleTitle) at render time
    consequence: "Reject screens out candidates whose primary background is in these roles, not {role_title}",
    rejectValue: "strict_reject",
  },
  {
    id: "seniority_mismatch",
    field: "seniority_mismatch_policy",
    label: "Overqualified seniority",
    staticContext: "Director, VP, Head-of, or equivalent applying for this role",
    consequence: "Reject flags them as likely to leave within 6 months",
    rejectValue: "reject_overqualified",
  },
  {
    id: "experience_surplus",
    field: "experience_surplus_policy",
    label: "Too much experience",
    staticContext: "Candidate has significantly more total experience than this role requires",
    consequence: "Reject filters out candidates likely misaligned on scope and expectations",
    rejectValue: "reject_overexperienced",
    rejectRequiresInput: true,
  },
];

function getAdjacentRoleExamples(roleTitle: string): string | null {
  const t = roleTitle.toLowerCase();
  if (t.includes("product manager") || t === "pm" || t.includes("product lead")) {
    return "Product Analyst, Business Analyst, Program Manager, Project Manager, UX Researcher, Growth Analyst";
  }
  if (t.includes("data analyst") || t.includes("analytics analyst")) {
    return "Data Engineer, Data Scientist, ML Engineer, Business Intelligence Developer, Database Admin";
  }
  if (t.includes("data scientist") || t.includes("machine learning") || t.includes("ml engineer")) {
    return "Data Analyst, Data Engineer, Research Scientist, BI Developer";
  }
  if (t.includes("backend") || t.includes("back-end") || t.includes("back end")) {
    return "Frontend Engineer, QA Engineer, DevOps Engineer, Data Engineer, Solutions Engineer";
  }
  if (t.includes("frontend") || t.includes("front-end") || t.includes("front end")) {
    return "Backend Engineer, QA Engineer, DevOps Engineer, UI/UX Designer";
  }
  if (t.includes("software engineer") || t.includes("swe") || t.includes("developer")) {
    return "QA Engineer, DevOps Engineer, Data Engineer, Solutions Engineer";
  }
  if (t.includes("sales") || t.includes("account executive") || t.includes("ae")) {
    return "Business Development (sourcing only), Marketing, Account Management (no quota), Customer Success";
  }
  if (t.includes("design") || t.includes("ux") || t.includes("ui")) {
    return "Product Manager, Frontend Engineer, UX Researcher, Content Strategist";
  }
  return null;
}

function getOverqualifiedContext(seniority: string): string {
  if (seniority.toLowerCase() === "intern") {
    return "Any full-time candidate (Junior and above) applying for an intern role";
  }
  return "Candidates 2+ levels above this role's seniority";
}

// ─── Clarifying questions ────────────────────────────────────────────────────
interface ClarifyingQuestion {
  id: string;
  field: "p0" | "p1" | "dealbreakers";
  question: string;
  context: string;
  options: string[];
  vague_phrase?: string;
}

// ─── Vagueness detector ──────────────────────────────────────────────────────
interface VaguenessWarning { issue: string; hint: string; }

// Signals that indicate a criterion IS specific enough
const HAS_SPECIFICS = [
  /\d+[k%+]/,                                                          // numbers with scale
  /\b\d+\s*(year|month|user|engineer|team|person)/i,                   // "5 years", "10 users", "3-person team"
  /own(ed|ing|ership)/i,
  /\b(led|built|shipped|launched|drove|architected?|founded|scaled|grew|increased|reduced)\b/i,
  /\b(impact|metric|outcome|result|revenue|growth|conversion|retention|latency|throughput)\b/i,
  /end[\s-]to[\s-]end/i,
  /from\s+(scratch|0|zero)/i,
  /production|prod\b/i,
  /\b(p&l|roadmap|stakeholder|cross[\s-]functional)\b/i,
];

// Patterns that are definitively vague — each produces a specific message
const VAGUE_PATTERNS: { re: RegExp; msg: (m: string) => string }[] = [
  { re: /\bgood\s+\w+/i,             msg: m => `"${m}" — what does 'good' mean here? Define the bar concretely.` },
  { re: /\bgreat\s+\w+/i,            msg: m => `"${m}" — 'great' is subjective. Describe what great looks like in practice.` },
  { re: /\bstrong\s+\w+/i,           msg: m => `"${m}" — 'strong' doesn't discriminate. Specify the depth or output you expect.` },
  { re: /\bsolid\s+\w+/i,            msg: m => `"${m}" — 'solid' is too vague. Replace with a concrete signal or bar.` },
  { re: /\bbasic\s+\w+/i,            msg: m => `"${m}" — 'basic' barely filters anyone. Set a real minimum bar.` },
  { re: /\brelevant\s+experience\b/i, msg: () => `"relevant experience" — this matches almost every applicant. Define what relevant means.` },
  { re: /\bwork(ing)?\s+experience\b/i, msg: () => `"work experience" alone — everyone has this. Add type, depth, or ownership expectations.` },
  { re: /\bproduct\s+(experience|sense|skills?|thinking)\b/i, msg: m => `"${m}" — too vague. What does product ownership look like at your bar?` },
  { re: /\bgood\s+projects?\b/i,     msg: m => `"${m}" — which kind? Side projects with users? End-to-end ownership? Define what counts.` },
  { re: /\bprojects?\s+here\b/i,     msg: () => `"projects here" — this describes nothing. What should the projects demonstrate?` },
  { re: /\b\d+\s+years?\s+(of\s+)?(work\s+|relevant\s+|industry\s+)?experience\b/i, msg: m => `"${m}" — years alone don't discriminate. Add what kind of work or ownership you expect.` },
  { re: /\bexperience\s+(in|with)\s+\w+/i, msg: m => `"${m}" — 'experience in X' passes anyone who listed X. Specify depth or output.` },
  { re: /\bgood\s+(at|with)\s+\w+/i, msg: m => `"${m}" — too vague. Describe the level of mastery or what 'good at X' produces.` },
];

function checkFieldVagueness(text: string): VaguenessWarning | null {
  if (!text || text.trim().length === 0) return null;

  if (text.trim().length < 60) {
    return {
      issue: `This is too brief to discriminate — "${text.trim()}" describes almost any candidate.`,
      hint: "Add specifics: ownership level, scope, outcomes, or what the bar actually looks like for this role.",
    };
  }

  const hasSpecifics = HAS_SPECIFICS.some(r => r.test(text));
  if (hasSpecifics) return null; // specific enough — don't warn

  for (const { re, msg } of VAGUE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      return {
        issue: msg(m[0]),
        hint: "Vague criteria like this shortlist the majority of applicants. Add measurables, ownership, depth, or a concrete outcome.",
      };
    }
  }

  return null;
}


function detectVagueness(criteria: CriteriaState): VaguenessWarning[] {
  const warnings: VaguenessWarning[] = [];
  const p0w = checkFieldVagueness(criteria.p0_text);
  if (p0w) warnings.push({ ...p0w, issue: `P0: ${p0w.issue}` } as VaguenessWarning);
  const p1w = checkFieldVagueness(criteria.p1_text);
  if (p1w) warnings.push({ ...p1w, issue: `P1: ${p1w.issue}` } as VaguenessWarning);
  return warnings;
}

const REJECT_CATEGORIES = [
  { id: "work_experience", label: "Work Experience" },
  { id: "ownership", label: "Ownership Level" },
  { id: "impact", label: "Impact Quality" },
  { id: "role_relevancy", label: "Role Relevancy" },
  { id: "skills", label: "Skills / Technical Fit" },
  { id: "pedigree", label: "Education / Background" },
];

function buildInitialCriteria(ep: any): CriteriaState {
  const p0Signals: string[] = ep.p0_signals ?? [];
  const p1Signals: string[] = ep.p1_signals ?? [];
  const redFlags: string[] = ep.red_flags ?? [];
  const hardReqs: any[] = ep.hard_requirements ?? [];

  const p0Parts = [...p0Signals];
  if (ep.domain) p0Parts.push(`Strong ${ep.domain} domain experience is a plus.`);
  const p0_text = p0Parts.join(". ").trim();

  const p1_text = p1Signals.join(". ").trim();

  const dealParts = [
    ...hardReqs.map((h: any) => h.what ? `${h.what}${h.what_does_not_count ? ` (not: ${h.what_does_not_count})` : ""}` : ""),
    ...redFlags,
  ].filter(Boolean);
  const dealbreakers = dealParts.join(". ").trim();

  const expMonths = ep.min_experience_months ?? 0;
  const snapped = EXP_OPTIONS.reduce((c, v) => Math.abs(v - expMonths) < Math.abs(c - expMonths) ? v : c, 0);

  const seniority = (ep.seniority ?? "mid").toLowerCase();
  const isFresherRole = seniority === "intern" || seniority === "junior";
  return {
    role_title: ep.role_title ?? "",
    seniority: seniority,
    min_experience_months: seniority === "intern" ? 0 : snapped,
    min_internship_months: isFresherRole ? 0 : undefined,
    p0_text,
    p1_text,
    dealbreakers,
    skills: (ep.skills ?? []).slice(0, 12),
    education_pedigree: ["no_preference"],
    company_pedigree: ["no_preference"],
    p0_education_pedigree: ["no_preference"],
    p0_company_pedigree: ["no_preference"],
    p1_education_pedigree: ["no_preference"],
    p1_company_pedigree: ["no_preference"],
    non_work_weight: "weak_signal" as const,
    adjacent_roles_policy: "ignore",
    seniority_mismatch_policy: "ignore",
    experience_surplus_policy: "ignore",
  };
}

// ─── Legacy Parameter Panel Types (kept for reference) ───────────────────────

interface ParamState {
  experience_requirement: string;
  skills_tags: string[];
  skills_what_counts: string;
  domain_requirement: string;
  degree_and_college: string;
  location_and_work_mode: string;
  communication_enabled: boolean;
  communication_value: string;
  ownership_enabled: boolean;
  ownership_value: string;
  impact_enabled: boolean;
  impact_value: string;
  acceptable_gaps_selected: string[];
  acceptable_gaps_custom: string;
  collaboration_enabled: boolean;
  collaboration_value: string;
  p0_experience: string;
  p0_ownership_and_impact: string;
  p0_speed_enabled: boolean;
  p0_speed_value: string;
  p0_domain_enabled: boolean;
  p0_domain_value: string;
  p0_pedigree_enabled: boolean;
  p0_pedigree_value: string;
  p0_uniqueness: string;
}

function buildInitialParams(ep: any): ParamState {
  const expMonths = ep.min_experience_months ?? 0;
  const expType = ep.experience_type ?? "either";
  const expText =
    expMonths === 0 ? "Fresher ok" :
    expType === "full_time_required" ? `${expMonths} months full-time` :
    expType === "internship_ok" ? `${expMonths} months (internship ok)` :
    `${expMonths} months`;

  const reqs: any[] = ep.hard_requirements ?? [];
  const skillReqs = reqs.filter(r => !/(experience|year|month|degree|education)/i.test(r.what));
  const whatCountsNote = skillReqs
    .map(r => `${r.what}: ${r.what_counts}. NOT: ${r.what_does_not_count}`)
    .join("\n");
  const p0: string[] = ep.p0_signals ?? [];

  return {
    experience_requirement: expText,
    skills_tags: skillReqs.map(r => r.what),
    skills_what_counts: whatCountsNote,
    domain_requirement: ep.domain ?? "",
    degree_and_college: "",
    location_and_work_mode: "",
    communication_enabled: false, communication_value: "",
    ownership_enabled: false, ownership_value: "",
    impact_enabled: false, impact_value: "",
    acceptable_gaps_selected: [], acceptable_gaps_custom: "",
    collaboration_enabled: false, collaboration_value: "",
    p0_experience: p0[0] ?? "",
    p0_ownership_and_impact: p0.slice(1, 3).join("\n"),
    p0_speed_enabled: false, p0_speed_value: "",
    p0_domain_enabled: false, p0_domain_value: "",
    p0_pedigree_enabled: false, p0_pedigree_value: "",
    p0_uniqueness: p0[3] ?? "",
  };
}

// ─── Parameter Panel Components ───────────────────────────────────────────────

function ParamField({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      {helper && <p className="text-[11px] text-slate-400 leading-relaxed">{helper}</p>}
      {children}
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2.5 border border-slate-200 rounded-lg bg-white focus-within:border-slate-400 min-h-[42px]">
      {tags.map((tag, i) => (
        <span key={i} className="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-2 py-1 rounded-md">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder={tags.length === 0 ? "Type and press Enter to add" : ""}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent placeholder-slate-400 py-0.5"
      />
    </div>
  );
}

function ToggleField({ enabled, onToggle, label, helper, value, onChange, placeholder }: {
  enabled: boolean; onToggle: () => void; label: string; helper?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onToggle} className="flex items-center gap-2.5 w-fit">
        <div className={`relative flex-shrink-0 w-8 h-[18px] rounded-full transition-colors duration-200 ${enabled ? "bg-slate-700" : "bg-slate-200"}`}>
          <span className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform duration-200 ${enabled ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
        </div>
        <span className={`text-xs font-medium transition-colors ${enabled ? "text-slate-800" : "text-slate-500"}`}>{label}</span>
      </button>
      {helper && <p className="text-[10px] text-slate-400 leading-relaxed pl-[2.375rem]">{helper}</p>}
      {enabled && (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-slate-50 transition-colors"
        />
      )}
    </div>
  );
}

function GapPicker({ options, selected, custom, onSelectedChange, onCustomChange }: {
  options: string[]; selected: string[]; custom: string;
  onSelectedChange: (s: string[]) => void; onCustomChange: (c: string) => void;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onSelectedChange(selected.filter(s => s !== opt));
    else if (selected.length < 2) onSelectedChange([...selected, opt]);
  };
  return (
    <div className="flex flex-col gap-3">
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt, i) => (
            <button key={i} type="button" onClick={() => toggle(opt)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selected.includes(opt) ? "bg-slate-800 text-white border-slate-800" :
                selected.length >= 2 ? "text-slate-300 border-slate-100 cursor-default" :
                "text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >{opt}</button>
          ))}
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Or type your own</p>
        <input value={custom} onChange={e => onCustomChange(e.target.value)}
          placeholder="e.g. Tool missing is fine if everything else is strong"
          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-slate-50"
        />
      </div>
    </div>
  );
}

function ParamSection({ title, subheading, color, children, defaultOpen = true }: {
  title: string; subheading: string; color: "red" | "blue" | "green";
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const s = {
    red:   { border: "border-red-300",      title: "text-red-700" },
    blue:  { border: "border-blue-300",     title: "text-blue-700" },
    green: { border: "border-emerald-400",  title: "text-emerald-700" },
  }[color];
  return (
    <div className={`border-l-2 ${s.border} pl-4`}>
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-start justify-between text-left">
        <div>
          <h3 className={`text-sm font-bold ${s.title}`}>{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{subheading}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />}
      </button>
      {open && <div className="flex flex-col gap-5 mt-4 pb-1">{children}</div>}
    </div>
  );
}

// ─── Auto-expanding textarea ─────────────────────────────────────────────────

function AutoTextarea({ value, onChange, placeholder, className, style }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
      className={className}
      style={{ overflow: "hidden", resize: "none", ...style }}
    />
  );
}

// ─── Clarifying Questions Modal ──────────────────────────────────────────────

function ClarifyingQuestionsModal({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: ClarifyingQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [freeTextOpen, setFreeTextOpen] = useState<Record<string, boolean>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});

  const FIELD_META: Record<string, { label: string; labelCls: string; selectedCls: string }> = {
    p0:           { label: "P0",           labelCls: "text-emerald-700", selectedCls: "bg-emerald-700 border-emerald-700 text-white" },
    p1:           { label: "P1",           labelCls: "text-amber-600",   selectedCls: "bg-amber-600 border-amber-600 text-white"   },
    dealbreakers: { label: "Minimum Eligibility Requirement", labelCls: "text-rose-600",    selectedCls: "bg-rose-600 border-rose-600 text-white"    },
  };

  const isAnswered = (qId: string) =>
    (freeTextOpen[qId] && !!freeText[qId]?.trim()) || (!freeTextOpen[qId] && (answers[qId]?.length ?? 0) > 0);

  const allAnswered = questions.every(q => isAnswered(q.id));

  const handleSelect = (qId: string, opt: string) => {
    setFreeTextOpen(prev => ({ ...prev, [qId]: false }));
    setAnswers(prev => {
      const cur = prev[qId] ?? [];
      const exists = cur.includes(opt);
      return { ...prev, [qId]: exists ? cur.filter(o => o !== opt) : [...cur, opt] };
    });
  };

  const handleFreeToggle = (qId: string) => {
    setFreeTextOpen(prev => {
      const opening = !prev[qId];
      if (opening) setAnswers(a => ({ ...a, [qId]: [] }));
      return { ...prev, [qId]: opening };
    });
  };

  const handleSubmit = () => {
    const final: Record<string, string> = {};
    for (const q of questions) {
      if (freeTextOpen[q.id] && freeText[q.id]?.trim()) final[q.id] = freeText[q.id].trim();
      else if (answers[q.id]?.length) final[q.id] = answers[q.id].join(" ... AND ... ");
    }
    onSubmit(final);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-16 px-4">
      <div className="bg-white w-full max-w-xl flex flex-col">
        <div className="px-8 pt-8 pb-6 border-b border-neutral-100">
          <h2 className="font-serif text-2xl text-neutral-900 mb-1.5">A few quick questions</h2>
          <p className="text-sm text-neutral-500 leading-relaxed">Your answers sharpen the criteria so the AI evaluates resumes more accurately.</p>
        </div>

        <div className="px-8 py-7 flex flex-col gap-8">
          {questions.map(q => {
            const meta = FIELD_META[q.field] ?? FIELD_META.p0;
            return (
              <div key={q.id} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.labelCls}`}>{meta.label}</span>
                  <p className="text-sm font-medium text-neutral-900 leading-snug">{q.question}</p>
                  {q.context && <p className="text-[11px] text-neutral-400 leading-relaxed">{q.context}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] text-neutral-400">Select one or more — multiple will be combined with AND</p>
                  {q.options.map(opt => {
                    const selected = !freeTextOpen[q.id] && (answers[q.id] ?? []).includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => handleSelect(q.id, opt)}
                        className={`text-left text-sm px-4 py-2.5 border transition-colors leading-snug flex items-start gap-2 ${selected ? meta.selectedCls : "border-neutral-200 text-neutral-700 hover:border-neutral-400"}`}
                      >
                        <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 border rounded-sm flex items-center justify-center text-[9px] font-bold ${selected ? "bg-white/20 border-white/40" : "border-neutral-300"}`}>
                          {selected ? "✓" : ""}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleFreeToggle(q.id)}
                    className={`text-left text-sm px-4 py-2.5 border transition-colors ${freeTextOpen[q.id] ? "border-neutral-400 text-neutral-700" : "border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-600"}`}
                  >
                    I'd rather specify →
                  </button>
                  {freeTextOpen[q.id] && (
                    <textarea
                      autoFocus
                      value={freeText[q.id] ?? ""}
                      onChange={e => setFreeText(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="Describe what you're looking for..."
                      rows={2}
                      className="w-full text-sm text-neutral-700 border border-neutral-300 focus:border-neutral-600 outline-none px-3 py-2.5 resize-none"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-8 pb-8 pt-5 flex items-center justify-between border-t border-neutral-100">
          <button onClick={onSkip} className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors">
            Skip, looks good as-is
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-6 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Apply answers <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
// (Criteria Panel Components removed — new UI uses inline form elements)


// ─── Compressed Evaluator View ───────────────────────────────────────────────

function isNewItem(item: string, prev: CompressedView | null | undefined): boolean {
  if (!prev) return false;
  const all = [...prev.must_have, ...prev.p0, ...prev.p1, ...prev.reject, ...prev.background];
  return !all.includes(item);
}

function CompressedEvaluatorView({
  data,
  prev,
  loading,
}: {
  data: CompressedView | null;
  prev?: CompressedView | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        {[80, 60, 90, 70].map((w, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded" style={{ width: `${w}%` }} />
        ))}
        <p className="text-[11px] text-slate-400">Building summary…</p>
      </div>
    );
  }

  if (!data) return null;

  const hasDiff = !!prev;

  const renderItems = (
    items: string[],
    icon: string,
    textCls: string,
    iconCls: string,
  ) => items.map((item, i) => {
    const isNew = hasDiff && isNewItem(item, prev);
    return (
      <div
        key={i}
        className={`flex gap-2 text-xs leading-relaxed rounded-lg px-2 py-1 -mx-2 transition-colors ${
          isNew ? "bg-blue-50 border border-blue-200" : ""
        } ${textCls}`}
      >
        <span className={`flex-shrink-0 font-bold mt-px ${iconCls}`}>{icon}</span>
        <span>{item}</span>
        {isNew && (
          <span className="ml-auto flex-shrink-0 text-[9px] font-bold text-blue-500 uppercase tracking-wider self-center">
            updated
          </span>
        )}
      </div>
    );
  });

  return (
    <div className="flex flex-col gap-4">

      {hasDiff && (
        <div className="flex items-center gap-2 text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span className="font-bold">●</span>
          <span>Highlighted items were updated by recalibration</span>
        </div>
      )}

      {data.must_have.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Must Have</p>
          <div className={`flex flex-col gap-1 bg-slate-50 border border-slate-200 rounded-xl p-3`}>
            {data.must_have.map((item, i) => {
              const isNew = hasDiff && isNewItem(item, prev);
              return (
                <div key={i} className={`flex gap-2 text-xs text-slate-700 leading-relaxed rounded-lg px-2 py-1 -mx-2 ${isNew ? "bg-blue-50 border border-blue-200" : ""}`}>
                  <span className="flex-shrink-0 font-bold text-slate-400 mt-px">{i + 1}.</span>
                  <span>{item}</span>
                  {isNew && <span className="ml-auto flex-shrink-0 text-[9px] font-bold text-blue-500 uppercase tracking-wider self-center">updated</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.p0.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">P0 — Strong Hire</p>
          <div className="flex flex-col gap-1 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            {renderItems(data.p0, "✦", "text-emerald-800", "text-emerald-400")}
          </div>
        </div>
      )}

      {data.p1.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">P1 — Interview Worthy</p>
          <div className="flex flex-col gap-1 bg-amber-50 border border-amber-100 rounded-xl p-3">
            {renderItems(data.p1, "◈", "text-amber-800", "text-amber-400")}
          </div>
        </div>
      )}

      {data.reject.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Auto-Reject</p>
          <div className="flex flex-col gap-1 bg-red-50 border border-red-100 rounded-xl p-3">
            {renderItems(data.reject, "✕", "text-red-800", "text-red-400")}
          </div>
        </div>
      )}

      {data.background.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Background & Domain</p>
          <div className="flex flex-col gap-1">
            {data.background.map((item, i) => {
              const isNew = hasDiff && isNewItem(item, prev);
              return (
                <div key={i} className={`flex gap-2 text-xs text-slate-600 leading-relaxed rounded-lg px-2 py-1 -mx-2 ${isNew ? "bg-blue-50 border border-blue-200" : ""}`}>
                  <span className="flex-shrink-0 text-slate-300 mt-px">·</span>
                  <span>{item}</span>
                  {isNew && <span className="ml-auto flex-shrink-0 text-[9px] font-bold text-blue-500 uppercase tracking-wider self-center">updated</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Formatted Evaluator Prompt ──────────────────────────────────────────────

function FormattedEvaluatorPrompt({ text }: { text: string }) {
  const lines = text.split("\n");

  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Empty line → small gap
    if (!trimmed) {
      nodes.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Section header: ------ TITLE ------
    if (/^-{3,}\s+.+\s+-{3,}$/.test(trimmed)) {
      const title = trimmed.replace(/^-+\s+/, "").replace(/\s+-+$/, "");
      nodes.push(
        <div key={i} className="flex items-center gap-2 pt-3 pb-0.5">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 px-1 whitespace-nowrap">
            {title}
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
      );
      i++;
      continue;
    }

    // Sub-label: lines that are short all-caps headings ending with colon
    if (/^[A-Z][A-Z &/()-]+:$/.test(trimmed)) {
      nodes.push(
        <p key={i} className="text-[11px] font-semibold text-slate-700 mt-2 mb-0.5">{trimmed}</p>
      );
      i++;
      continue;
    }

    // P0 / P1 / Reject label lines
    if (/^P0\s/.test(trimmed) || trimmed === "P0 (VERY RARE):" || trimmed === "P0:") {
      nodes.push(<p key={i} className="text-[11px] font-bold text-emerald-700 mt-2">{trimmed}</p>);
      i++; continue;
    }
    if (/^P1\s/.test(trimmed) || trimmed === "P1 (NARROW BAND):" || trimmed === "P1:") {
      nodes.push(<p key={i} className="text-[11px] font-bold text-amber-700 mt-2">{trimmed}</p>);
      i++; continue;
    }
    if (/^Reject[:\s]/.test(trimmed) || trimmed === "Reject:") {
      nodes.push(<p key={i} className="text-[11px] font-bold text-red-700 mt-2">{trimmed}</p>);
      i++; continue;
    }

    // IMPORTANT / NOTE prefix
    if (/^IMPORTANT[:\s]/.test(trimmed) || /^NOTE[:\s]/.test(trimmed) || /^If ANY/.test(trimmed) || /^Any doubt/.test(trimmed)) {
      nodes.push(
        <p key={i} className="text-[11px] font-semibold text-slate-600 mt-1">{trimmed}</p>
      );
      i++; continue;
    }

    // Collect a consecutive numbered list block
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^\d+\.\s+(.+)/);
        if (m) items.push(m[1]);
        i++;
      }
      nodes.push(
        <ol key={i} className="flex flex-col gap-0.5 pl-1 mt-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex gap-1.5 text-[11px] text-slate-600 leading-relaxed">
              <span className="flex-shrink-0 w-3.5 text-slate-400 font-medium text-right">{j + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Collect a consecutive bullet list block
    if (/^[-•]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^[-•]\s+(.+)/);
        if (m) items.push(m[1]);
        i++;
      }
      nodes.push(
        <ul key={i} className="flex flex-col gap-0.5 pl-1 mt-0.5">
          {items.map((item, j) => (
            <li key={j} className="flex gap-1.5 text-[11px] text-slate-600 leading-relaxed">
              <span className="flex-shrink-0 text-slate-400 mt-[3px]">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph text
    nodes.push(
      <p key={i} className="text-[11px] text-slate-600 leading-relaxed">{trimmed}</p>
    );
    i++;
  }

  return <div className="flex flex-col gap-0.5">{nodes}</div>;
}

// ─── Diff utilities ──────────────────────────────────────────────────────────

type DiffLine = { type: "unchanged" | "added" | "removed"; text: string };

function computeLineDiff(original: string, current: string): DiffLine[] {
  const a = original.split("\n");
  const b = current.split("\n");
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      result.unshift({ type: "unchanged", text: a[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: "added", text: b[j-1] }); j--;
    } else {
      result.unshift({ type: "removed", text: a[i-1] }); i--;
    }
  }
  return result;
}

function DiffView({ original, current }: { original: string; current: string }) {
  const diff = computeLineDiff(original, current);
  const added = diff.filter(d => d.type === "added").length;
  const removed = diff.filter(d => d.type === "removed").length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-700 font-semibold">+{added} added</span>
        <span className="text-red-600 font-semibold">−{removed} removed</span>
      </div>
      <div
        className="font-mono text-xs leading-relaxed border border-slate-200 rounded-lg overflow-auto bg-white"
        style={{ maxHeight: 360 }}
      >
        {diff.map((line, i) => (
          <div
            key={i}
            className={
              line.type === "added"
                ? "bg-emerald-50 border-l-2 border-emerald-400 pl-3 pr-2 py-px text-emerald-800"
                : line.type === "removed"
                ? "bg-red-50 border-l-2 border-red-400 pl-3 pr-2 py-px text-red-700 line-through opacity-70"
                : "pl-4 pr-2 py-px text-slate-600"
            }
          >
            <span className="select-none mr-2 opacity-50">
              {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
            </span>
            {line.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Evaluator Prompt Editor ─────────────────────────────────────────────────

function EvaluatorPromptEditor({
  evaluatorPrompt,
  originalPrompt,
  onSave,
  onAcceptChanges,
  onRejectChanges,
  compressedData,
  prevCompressedData,
  compressing,
}: {
  evaluatorPrompt: string;
  originalPrompt?: string | null;
  onSave: (newPrompt: string) => Promise<void>;
  onAcceptChanges?: () => void;
  onRejectChanges?: () => void;
  compressedData?: CompressedView | null;
  prevCompressedData?: CompressedView | null;
  compressing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState(evaluatorPrompt);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasChanges = !!originalPrompt && originalPrompt !== evaluatorPrompt;

  useEffect(() => {
    setDraft(evaluatorPrompt);
    setDirty(false);
    setSaveError(null);
    setViewMode('view');
    if (originalPrompt && evaluatorPrompt !== originalPrompt) {
      setShowDiff(true);
      setOpen(true);
    }
  }, [evaluatorPrompt, originalPrompt]);

  const handleChange = (val: string) => {
    setDraft(val);
    setDirty(val !== evaluatorPrompt);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      setDirty(false);
    } catch (e: any) {
      setSaveError(e.message ?? "Failed to apply changes");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft(evaluatorPrompt);
    setDirty(false);
    setSaveError(null);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Pencil className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Evaluator Prompt
          </span>
          {dirty && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              Unsaved
            </span>
          )}
          {hasChanges && !dirty && (
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
              Recalibrated
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-3 border-t border-slate-100">
          {hasChanges && (
            <div className="flex gap-1 border border-slate-200 rounded-lg p-0.5 self-start bg-slate-100">
              <button
                onClick={() => setShowDiff(false)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${!showDiff ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Edit
              </button>
              <button
                onClick={() => setShowDiff(true)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${showDiff ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Changes
              </button>
            </div>
          )}
          {showDiff && hasChanges ? (
            <div className="flex flex-col gap-3">
              <DiffView original={originalPrompt!} current={evaluatorPrompt} />
              <div className="flex gap-2">
                {onAcceptChanges && (
                  <button
                    onClick={() => { onAcceptChanges(); setShowDiff(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept Changes
                  </button>
                )}
                {onRejectChanges && (
                  <button
                    onClick={() => { onRejectChanges(); setShowDiff(false); }}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Reject Changes
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-1 border border-slate-200 rounded-lg p-0.5 self-start bg-slate-100">
                <button
                  onClick={() => setViewMode('view')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'view' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  View
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'edit' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Edit
                </button>
              </div>

              {viewMode === 'view' ? (
                <CompressedEvaluatorView
                  data={compressedData ?? null}
                  prev={prevCompressedData}
                  loading={compressing}
                />
              ) : (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Edit the prompt below. Clicking <strong>Apply Changes</strong> will re-derive the role requirements from your edits.
                  </p>
                  <textarea
                    value={draft}
                    onChange={e => handleChange(e.target.value)}
                    className="w-full font-mono text-xs leading-relaxed border border-slate-200 rounded-lg p-3 text-slate-700 bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition-colors resize-y"
                    style={{ minHeight: 280 }}
                  />
                </>
              )}
            </>
          )}
          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
              {saveError}
            </p>
          )}
          {dirty && (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Applying...</>
                ) : ("Apply Changes")}
              </button>
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function readCache(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem("rs:state") ?? "null") ?? {}; }
  catch { return {}; }
}

function ResumeModalOverlay({ url, result, onClose }: { url: string; result: any; onClose: () => void }) {
  const rating: "P0" | "P1" | "Reject" = result?.rating;
  const ratingConfig = {
    P0: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800", label: "Strong Hire" },
    P1: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-800", label: "Possible Hire" },
    Reject: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-800", label: "Not a Fit" },
  }[rating] ?? { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", badge: "bg-slate-100 text-slate-700", label: "" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white shadow-2xl overflow-hidden flex flex-row"
        style={{ width: "min(1160px, 96vw)", height: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left panel: feedback ── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-neutral-200 bg-white">
          {/* Name + close */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 bg-neutral-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-600">
                {(result?.name ?? "?")[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-medium text-neutral-800 truncate">{result?.name ?? "Resume"}</span>
            </div>
            <button onClick={onClose} className="flex-shrink-0 ml-2 text-neutral-400 hover:text-neutral-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Rating badge */}
          {rating && (
            <div className={`px-4 py-3 border-b ${ratingConfig.border} ${ratingConfig.bg} flex-shrink-0`}>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${ratingConfig.badge}`}>
                {rating} — {ratingConfig.label}
              </span>
            </div>
          )}

          {/* Feedback content — scrollable if long */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {result?.reject_reason && !isExpText(result.reject_reason) && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1.5">Reject Reason</p>
                <p className="text-xs text-red-700 leading-relaxed">{result.reject_reason}</p>
              </div>
            )}
            {(result?.reasoning ?? []).filter((r: string) => !isExpText(r)).length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Reasoning</p>
                <ul className="flex flex-col gap-1.5">
                  {(result.reasoning as string[]).filter((r: string) => !isExpText(r)).map((r, i) => (
                    <li key={i} className={`text-xs leading-relaxed ${ratingConfig.text}`}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}
            {(result?.concerns ?? []).filter((c: string) => !isExpText(c)).length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1.5">Concerns</p>
                <ul className="flex flex-col gap-1.5">
                  {(result.concerns as string[]).filter((c: string) => !isExpText(c)).map((c, i) => (
                    <li key={i} className="text-xs text-amber-700 leading-relaxed bg-amber-50 border border-amber-200 rounded px-2 py-1">! {c}</li>
                  ))}
                </ul>
              </div>
            )}
            {result?.rank != null && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Rank</p>
                <p className="text-sm font-bold text-neutral-700">#{result.rank}</p>
              </div>
            )}
            {(result?.email || result?.phone) && (
              <div className="mt-auto pt-4 border-t border-neutral-100">
                {result.email && <p className="text-xs text-neutral-500">{result.email}</p>}
                {result.phone && <p className="text-xs text-neutral-500 mt-0.5">{result.phone}</p>}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: PDF viewer ── */}
        <PdfViewer url={url} className="flex-1" style={{ minHeight: 0, minWidth: 0 }} />
      </div>
    </div>
  );
}

function readRoles(): ATSRole[] {
  try { return JSON.parse(localStorage.getItem("rs:roles") ?? "null") ?? []; }
  catch { return []; }
}

export default function App() {
  const cache = useMemo(readCache, []); // read once on mount, never again

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 State
  const [jd, setJd] = useState("");
  const [roleOverride, setRoleOverride] = useState("");
  const [generating, setGenerating] = useState(false);
  const [paramsData, setParamsData] = useState<GeneratePromptResponse | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const prevJd = useRef("");

  // JD generation (describe mode)
  const [jdMode, setJdMode] = useState<"describe" | "paste">("describe");
  const [describeRole, setDescribeRole] = useState("");
  const [describeStatement, setDescribeStatement] = useState("");
  const [generatingJd, setGeneratingJd] = useState(false);
  const [generatedJd, setGeneratedJd] = useState("");
  const [jdGenError, setJdGenError] = useState<string | null>(null);

  // Step 2 State
  const [tasteResumes, setTasteResumes] = useState<{file: File, name: string}[]>([]);
  const [tasteResults, setTasteResults] = useState<TasteResult[]>([]);
  const [parsedResumes, setParsedResumes] = useState<{ text: string; filename: string }[]>([]);
  const [currentBatchFilenames, setCurrentBatchFilenames] = useState<string[]>([]);
  const [evaluatedFilenames, setEvaluatedFilenames] = useState<Set<string>>(new Set());
  const [tasteParseErrorCount, setTasteParseErrorCount] = useState(0);
  const [tasteParseFailedNames, setTasteParseFailedNames] = useState<string[]>([]);
  const [evaluatingTaste, setEvaluatingTaste] = useState(false);
  const [tasteProgress, setTasteProgress] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [tastePoolCount, setTastePoolCount] = useState(0);
  const [tasteCandidatePool, setTasteCandidatePool] = useState<CandidateSignal[]>([]);
  const [feedback, setFeedback] = useState<Record<string, "agree" | "disagree_too_high" | "disagree_too_low">>({});
  const [disagreeStage, setDisagreeStage] = useState<Record<string, { direction?: "higher" | "lower"; target?: "P0" | "P1" | "Reject" | "Baseline" }>>({});
  const [recalibrating, setRecalibrating] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<Record<string, { category: string[]; description: string }>>({});
  const [tweakingFilenames, setTweakingFilenames] = useState<Set<string>>(new Set());
  const [reviewIndex, setReviewIndex] = useState(0);
  const [inlineRecalibrating, setInlineRecalibrating] = useState(false);
  const [consecutiveAgrees, setConsecutiveAgrees] = useState(0);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const [tasteIntroSeen, setTasteIntroSeen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Step 3 State
  const [bulkResumes, setBulkResumes] = useState<{file: File, name: string}[]>([]);
  const [resumeModal, setResumeModal] = useState<{ url: string; result: any } | null>(null);

  // Accumulates ALL uploaded File objects across every screening run in this session.
  // React state (bulkResumes / tasteResumes) gets replaced each run, so files from
  // earlier runs would otherwise disappear. This ref keeps them all.
  const allFilesRef = useRef<Map<string, File>>(new Map());

  // Files queued from RoleDetail "Upload more" — picked up by useEffect when step 3 renders.
  const pendingUploadRef = useRef<File[] | null>(null);

  // Save a file to both in-memory ref and IndexedDB (persists across page refreshes).
  const registerFile = (name: string, file: File) => {
    allFilesRef.current.set(name, file);
    idbSaveFile(name, file);
  };

  const findResumeFile = async (filename: string, shareToken?: string): Promise<File | null> => {
    const mem = allFilesRef.current.get(filename)
      ?? bulkResumes.find(r => r.name === filename)?.file
      ?? tasteResumes.find(r => r.name === filename)?.file;
    if (mem) return mem;
    const fromIdb = await idbGetFile(filename);
    if (fromIdb) {
      allFilesRef.current.set(filename, fromIdb);
      return fromIdb;
    }
    // Last resort: fetch from backend share store
    if (shareToken) {
      try {
        const url = getShareFileUrl(shareToken, filename);
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], filename, { type: blob.type || "application/pdf" });
          allFilesRef.current.set(filename, file);
          idbSaveFile(filename, file);
          return file;
        }
      } catch {}
    }
    return null;
  };

  const openResumeModal = async (filename: string, result: any) => {
    const file = await findResumeFile(filename);
    if (!file) return;
    const url = URL.createObjectURL(file);
    setResumeModal({ url, result });
  };
  const closeResumeModal = () => {
    if (resumeModal) URL.revokeObjectURL(resumeModal.url);
    setResumeModal(null);
  };
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [highPassDialog, setHighPassDialog] = useState<{ pct: number; passed: number; screened: number } | null>(null);
  const [screening, setScreening] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ phase: string; done: number; total: number } | null>(null);
  const [bulkParseErrorCount, setBulkParseErrorCount] = useState(0);
  const [bulkUploadTotal, setBulkUploadTotal] = useState(0);
  const [bulkParseFailedNames, setBulkParseFailedNames] = useState<string[]>([]);
  const [manualRatingOverrides, setManualRatingOverrides] = useState<Record<string, "P0" | "P1" | "Reject">>({});
  const [ranking, setRanking] = useState(false);
  const [rankingProgress, setRankingProgress] = useState<{ done: number; total: number } | null>(null);
  const [scorerOpen, setScorerOpen] = useState(false);
  const [originalEvaluatorPrompt, setOriginalEvaluatorPrompt] = useState<string | null>(cache.originalEvaluatorPrompt ?? null);

  // Step 1 criteria panel state
  const [criteria, setCriteria] = useState<CriteriaState | null>(cache.criteria ?? null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [vaguenessModal, setVaguenessModal] = useState<VaguenessWarning[] | null>(null);
  const [criteriaApplied, setCriteriaApplied] = useState<{ p0: boolean; p1: boolean; dealbreakers: boolean }>({
    p0: !!cache.criteriaApplied?.p0,
    p1: !!cache.criteriaApplied?.p1,
    dealbreakers: !!cache.criteriaApplied?.dealbreakers,
  });
  // Role questions done: true if criteria already has policy fields answered (from cache), false on fresh generate
  const [roleQsDone, setRoleQsDone] = useState<boolean>(
    cache.criteria != null && cache.criteria.adjacent_roles_policy != null
  );
  const [roleQsCustomMode, setRoleQsCustomMode] = useState<Record<string, boolean>>({});
  const [roleQsRejectInputMode, setRoleQsRejectInputMode] = useState<Record<string, boolean>>({});
  const [fieldVagueness, setFieldVagueness] = useState<{ p0: VaguenessWarning | null; p1: VaguenessWarning | null }>({ p0: null, p1: null });
  const [vaguenessChecking, setVaguenessChecking] = useState<{ p0: boolean; p1: boolean }>({ p0: false, p1: false });
  const [rawPromptOpen, setRawPromptOpen] = useState(false);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyingQuestion[] | null>(null);
  const [clarifyingOpen, setClarifyingOpen] = useState(false);
  const [clarifyPendingCriteria, setClarifyPendingCriteria] = useState<CriteriaState | null>(null);
  const [clarifyPendingField, setClarifyPendingField] = useState<"p0" | "p1" | "dealbreakers" | null>(null);
  const [clarifyingField, setClarifyingField] = useState<"p0" | "p1" | "dealbreakers" | null>(null);
  const [p0p1SimilarityWarning, setP0p1SimilarityWarning] = useState<string | null>(null);

  // Evaluator prompt panel state (step 1 left)
  const [promptPanelVisible, setPromptPanelVisible] = useState(false);
  const [promptEditMode, setPromptEditMode] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptEditDirty, setPromptEditDirty] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null);

  // Compressed evaluator view
  const [compressedView, setCompressedView] = useState<CompressedView | null>(cache.compressedView ?? null);
  const [prevCompressedView, setPrevCompressedView] = useState<CompressedView | null>(null);
  const [compressingView, setCompressingView] = useState(false);

  // ── ATS wrapper state ──────────────────────────────────────────────────────
  const [appView, setAppView] = useState<AppView>("roles");
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [roles, setRoles] = useState<ATSRole[]>(() => readRoles());
  const [showShortlistModal, setShowShortlistModal] = useState(false);
  const shortlistSentRef = useRef(false);
  const [shareLoadState, setShareLoadState] = useState<"idle" | "loading" | "error">("idle");

  const paramsDataRef = useRef(paramsData);
  useEffect(() => { paramsDataRef.current = paramsData; }, [paramsData]);

  // Debounced P0/P1 similarity check via LLM
  useEffect(() => {
    const p0 = criteria?.p0_text ?? "";
    const p1 = criteria?.p1_text ?? "";
    if (!p0.trim() || !p1.trim()) { setP0p1SimilarityWarning(null); return; }
    const timer = setTimeout(async () => {
      try {
        const result = await checkP0P1Similarity(p0, p1);
        setP0p1SimilarityWarning(result.too_similar ? (result.reason || "P0 and P1 criteria are too similar.") : null);
      } catch { /* ignore network errors */ }
    }, 1500);
    return () => clearTimeout(timer);
  }, [criteria?.p0_text, criteria?.p1_text]);

  // ── Shared role: load from backend when /role/[token] is in URL ─────────────
  useEffect(() => {
    const match = window.location.pathname.match(/^\/role\/([^/]+)$/);
    const shareToken = match ? match[1] : null;
    if (!shareToken) return;
    setShareLoadState("loading");
    getShare(shareToken)
      .then(({ role }) => {
        if (!role || !role.id) throw new Error("Invalid share data");
        const sharedRole: ATSRole = { ...role, shareToken };
        setRoles(prev => {
          const exists = prev.some(r => r.shareToken === shareToken);
          return exists ? prev.map(r => r.shareToken === shareToken ? sharedRole : r) : [sharedRole, ...prev];
        });
        setActiveRoleId(sharedRole.id);
        setAppView("role-detail");
        setShareLoadState("idle");
      })
      .catch(() => setShareLoadState("error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start screening when navigating to step 3 with pending files from RoleDetail.
  useEffect(() => {
    if (step === 3 && appView === "screener" && pendingUploadRef.current && paramsData) {
      const files = pendingUploadRef.current;
      pendingUploadRef.current = null;
      screenFiles(files);
    }
  }, [step, appView, paramsData]); // paramsData in deps: fires when restored from role

  // ── Persist params + all screener UI state on the role so everything survives forever ──
  // ONLY save while inside the screener — prevents new roles inheriting stale params from a previous session
  useEffect(() => {
    if (paramsData && activeRoleId && appView === "screener") {
      setRoles(prev => prev.map(r =>
        r.id === activeRoleId ? {
          ...r,
          params: paramsData,
          screenerState: {
            jd,
            describeRole,
            describeStatement,
            generatedJd,
            criteria,
            criteriaApplied,
            compressedView,
            originalEvaluatorPrompt,
          },
        } : r
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsData, activeRoleId, appView]);

  // ── Mark taste calibration done on the role when completed ────────────────
  useEffect(() => {
    if (calibrationComplete && activeRoleId && appView === "screener") {
      setRoles(prev => prev.map(r =>
        r.id === activeRoleId ? { ...r, tasteCalibrated: true } : r
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrationComplete, activeRoleId, appView]);

  // ── Persist session UI state (paramsData lives on role.params, not here) ──────
  useEffect(() => {
    try {
      localStorage.setItem("rs:state", JSON.stringify({
        criteria,
        criteriaApplied,
        compressedView,
        originalEvaluatorPrompt,
      }));
    } catch {}
  }, [criteria, criteriaApplied, compressedView, originalEvaluatorPrompt]);

  useEffect(() => {
    try { localStorage.setItem("rs:roles", JSON.stringify(roles)); }
    catch {}
  }, [roles]);

  const batchEndTriggeredRef = useRef(false);

  useEffect(() => {
    const item = tasteResults[reviewIndex];
    if (!item) { setPdfUrl(null); return; }
    const file = tasteResumes.find(r => r.name === item.filename)?.file;
    if (!file) { setPdfUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [reviewIndex, tasteResults, tasteResumes]);

  // Criteria auto-debounce removed — evaluator prompt only builds on explicit "Apply Changes" click

  // Auto-advance to next batch when current batch is fully reviewed
  useEffect(() => {
    if (tasteResults.length === 0 || reviewIndex < tasteResults.length) {
      batchEndTriggeredRef.current = false;
      return;
    }
    if (batchEndTriggeredRef.current || evaluatingTaste) return;
    batchEndTriggeredRef.current = true;
    const remaining = parsedResumes.filter(r => !evaluatedFilenames.has(r.filename));
    if (remaining.length > 0 && paramsDataRef.current) {
      setTimeout(() => handleNextBatch(), 300);
    }
  }, [reviewIndex, tasteResults.length, evaluatingTaste, parsedResumes, evaluatedFilenames]); // eslint-disable-line react-hooks/exhaustive-deps

  const pb = useProgressBar();
  const jdDirty = paramsData !== null && jd !== prevJd.current;

  // ── Step 1: Generate JD from describe mode ──
  const handleGenerateJd = async () => {
    if (!describeRole.trim() || !describeStatement.trim()) return;
    setGeneratingJd(true);
    setJdGenError(null);
    try {
      const data = await generateJd(describeRole.trim(), describeStatement.trim());
      if (data.error) {
        setJdGenError(data.error);
      } else {
        setGeneratedJd(data.jd ?? "");
        setJd(data.jd ?? "");
        setRoleOverride(describeRole.trim());
      }
    } catch (e: any) {
      setJdGenError(e.message ?? "Request failed");
    } finally {
      setGeneratingJd(false);
    }
  };

  // ── Step 1: Generate criteria ──
  const handleGenerate = async () => {
    if (!jd.trim()) return;
    setGenerating(true);
    setGenError(null);
    setParamsData(null);
    try {
      const data = await generatePrompt(jd.trim(), roleOverride.trim() || undefined);
      if (data.error) {
        setGenError(data.error);
      } else {
        const dataWithoutPrompt = { ...data, evaluator_prompt: "" };
        setParamsData(dataWithoutPrompt);
        paramsDataRef.current = dataWithoutPrompt;
        setOriginalEvaluatorPrompt(null);
        const built = buildInitialCriteria(data.extracted_params);
        setCriteria(built);
        setCriteriaApplied({ p0: false, p1: false, dealbreakers: false });
        setRoleQsDone(false);
        setRoleQsCustomMode({});
        setRoleQsRejectInputMode({});
        setFieldVagueness({ p0: null, p1: null });
        setApplyLoading(false);
        setApplyError(null);
        setPromptPanelVisible(false);
        setPromptEditMode(false);
        setPromptDraft("");
        setPromptEditDirty(false);
        setPromptSaveError(null);
        setClarifyingQuestions(null);
        setClarifyingOpen(false);
        setClarifyPendingCriteria(null);
        setClarifyPendingField(null);
        setClarifyingField(null);
        setTasteResults([]);
        setParsedResumes([]);
        setCurrentBatchFilenames([]);
        setEvaluatedFilenames(new Set());
        setTasteParseErrorCount(0);
        setTasteCandidatePool([]);
        setBulkResults([]);
        prevJd.current = jd;
      }
    } catch (e: any) {
      setGenError(e.message ?? "Request failed");
    } finally {
      setGenerating(false);
    }
  };

  const updateCriteria = (updater: (prev: CriteriaState) => CriteriaState) => {
    setCriteria(prev => {
      if (!prev) return prev;
      return updater(prev);
    });
  };

  const doBuildEvaluator = async (c: CriteriaState) => {
    if (!paramsData) return;
    try {
      const res = await buildEvaluatorFromCriteria(c);
      if (res.error || !res.evaluator_prompt) {
        setApplyError(res.error ?? "Failed to build evaluator prompt");
      } else {
        const updated = { ...paramsData, evaluator_prompt: res.evaluator_prompt, scoring_params: res.scoring_params, scorer_prompt: res.scorer_prompt };
        setParamsData(updated);
        paramsDataRef.current = updated;
        // Reset taste checker — criteria changed, old verdicts are stale
        setTasteResults([]);
        setParsedResumes([]);
        setTasteResumes([]);
        setCurrentBatchFilenames([]);
        setEvaluatedFilenames(new Set());
        setTasteParseErrorCount(0);
        setTasteCandidatePool([]);
        setReviewIndex(0);
        setBulkResults([]);
        setRanking(false);
        setRankingProgress(null);
        setOriginalEvaluatorPrompt(res.evaluator_prompt);
        setPromptPanelVisible(true);
        setPromptEditMode(false);
        setPromptDraft(res.evaluator_prompt);
        setPromptEditDirty(false);
        setPrevCompressedView(null);
        setCompressedView(null);
        setCompressingView(true);
        try {
          const cv = await compressEvalPrompt(res.evaluator_prompt);
          setCompressedView(cv);
        } finally {
          setCompressingView(false);
        }
      }
    } catch (e: any) {
      setApplyError(e.message ?? "Request failed");
    } finally {
      setApplyLoading(false);
    }
  };

  const runRanking = async (finalResults: any[]) => {
    const params = paramsDataRef.current;
    if (!params?.scoring_params?.length || !params?.scorer_prompt) return;
    const shortlisted = finalResults.filter(r => r.rating === "P0" || r.rating === "P1");
    if (shortlisted.length === 0) return;

    setRanking(true);
    setRankingProgress({ done: 0, total: shortlisted.length });
    const MAX_RETRIES = 3;
    let retries = 0;
    let rankSuccess = false;
    try {
      const candidates = shortlisted.map(r => ({
        filename: r.filename,
        name: r.name,
        signal_json: r.signal_json ?? {},
        rating: r.rating,
      }));
      while (!rankSuccess && retries <= MAX_RETRIES) {
        try {
          const stream = rankCandidatesStream(candidates, params.scorer_prompt, params.scoring_params);
          for await (const event of stream) {
            if (event.type === "scored") {
              setRankingProgress({ done: event.completed, total: event.total });
            } else if (event.type === "ranked") {
              const rankMap = new Map<string, { rank: number; composite_score: number; raw_scores: Record<string, number> }>();
              for (const entry of (event.ranked ?? [])) {
                rankMap.set(entry.filename, { rank: entry.rank, composite_score: entry.composite_score, raw_scores: entry.raw_scores ?? {} });
              }
              setBulkResults(prev => prev.map(r => {
                const ranked = rankMap.get(r.filename);
                if (!ranked) return r;
                return { ...r, rank: ranked.rank, composite_score: ranked.composite_score, raw_scores: ranked.raw_scores };
              }));
              rankSuccess = true;
            }
          }
          break;
        } catch (streamErr: any) {
          retries++;
          if (retries > MAX_RETRIES) break;
          console.warn(`[ranking] stream interrupted — retry ${retries}/${MAX_RETRIES}`);
          setRankingProgress({ done: 0, total: shortlisted.length });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (e: any) {
      console.error("Ranking failed:", e);
    } finally {
      setRanking(false);
      setRankingProgress(null);
    }
  };

  const buildClarificationPayload = (
    currentCriteria: CriteriaState,
    focusField?: "p0" | "p1" | "dealbreakers"
  ) => ({
    criteria: {
      p0_text: currentCriteria.p0_text,
      p1_text: currentCriteria.p1_text,
      dealbreakers: currentCriteria.dealbreakers,
      role_title: currentCriteria.role_title,
      seniority: currentCriteria.seniority,
      min_experience_months: currentCriteria.min_experience_months,
    },
    jd_context: jd,
    source_context: describeStatement.trim() || generatedJd.trim() || jd.trim(),
    source_role: describeRole.trim() || roleOverride.trim() || currentCriteria.role_title,
    role_family: paramsData?.extracted_params?.role_family,
    focus_field: focusField,
  });

  const applyFieldLocally = (field: "p0" | "p1" | "dealbreakers", nextCriteria?: CriteriaState) => {
    if (nextCriteria) setCriteria(nextCriteria);
    setCriteriaApplied(prev => ({ ...prev, [field]: true }));
  };

  const requestFieldClarification = async (field: "p0" | "p1" | "dealbreakers") => {
    if (!criteria || !paramsData || clarifyingField) return;
    const fieldText = criteria[field === "p0" ? "p0_text" : field === "p1" ? "p1_text" : "dealbreakers"];
    if (!fieldText.trim()) return;

    setClarifyingField(field);
    try {
      const qRes = await generateClarifyingQuestions(buildClarificationPayload(criteria, field));
      if (qRes.needs_clarification && qRes.questions && qRes.questions.length > 0) {
        setClarifyingQuestions(qRes.questions);
        setClarifyPendingCriteria(criteria);
        setClarifyPendingField(field);
        setClarifyingOpen(true);
        return;
      }
      applyFieldLocally(field);
    } catch {
      applyFieldLocally(field);
    } finally {
      setClarifyingField(prev => prev === field ? null : prev);
    }
  };

  const handleApplyChanges = async () => {
    if (!criteria || !paramsData || applyLoading) return;
    setApplyLoading(true);
    setApplyError(null);
    try {
      await doBuildEvaluator(criteria);
    } catch {
      await doBuildEvaluator(criteria);
    }
  };

  const handleClarifySubmit = async (answers: Record<string, string>) => {
    setClarifyingOpen(false);
    const base = clarifyPendingCriteria ?? criteria;
    if (!base) return;
    const qs = clarifyingQuestions ?? [];
    const join = (field: "p0" | "p1" | "dealbreakers") =>
      qs.filter(q => q.field === field).map(q => answers[q.id]).filter(Boolean).join(". ");
    const p0extra = join("p0");
    const p1extra = join("p1");
    const dbextra = join("dealbreakers");
    const enhanced: CriteriaState = {
      ...base,
      p0_text: base.p0_text + (p0extra ? ` ${p0extra}.` : ""),
      p1_text: base.p1_text + (p1extra ? ` ${p1extra}.` : ""),
      dealbreakers: base.dealbreakers + (dbextra ? ` ${dbextra}.` : ""),
    };
    setCriteria(enhanced);
    if (clarifyPendingField) {
      applyFieldLocally(clarifyPendingField, enhanced);
      setClarifyPendingCriteria(null);
      setClarifyPendingField(null);
      return;
    }
    setClarifyPendingCriteria(null);
    setApplyLoading(true);
    setApplyError(null);
    await doBuildEvaluator(enhanced);
  };

  const handleSaveEvaluatorPrompt = async (newPrompt: string) => {
    if (!paramsData) return;
    const result = await parseEvaluatorPrompt(newPrompt);
    if (result.error || !result.extracted_params) {
      throw new Error(result.error ?? "Failed to re-derive requirements");
    }
    setParamsData({
      ...paramsData,
      evaluator_prompt: newPrompt,
      extracted_params: result.extracted_params,
    });
  };

  const handlePromptDirectSave = async () => {
    if (!paramsData || !promptEditDirty) return;
    setPromptSaving(true);
    setPromptSaveError(null);
    try {
      const result = await parseEvaluatorPrompt(promptDraft);
      if (result.error || !result.extracted_params) {
        throw new Error(result.error ?? "Failed to re-derive requirements");
      }
      const updated = { ...paramsData, evaluator_prompt: promptDraft, extracted_params: result.extracted_params };
      setParamsData(updated);
      paramsDataRef.current = updated;
      setPromptEditDirty(false);
      setPromptEditMode(false);
    } catch (e: any) {
      setPromptSaveError(e.message ?? "Save failed");
    } finally {
      setPromptSaving(false);
    }
  };

  // ── Step 2: Taste Check ──

  const runBatch = async (batch: { text: string; filename: string }[], evaluatorPrompt: string, compressorPrompt: string) => {
    const filenames = batch.map(r => r.filename);
    setCurrentBatchFilenames(filenames);
    setEvaluatedFilenames(prev => new Set([...prev, ...filenames]));
    setTasteResults(filenames.map(f => ({ filename: f, name: f, result: null })));
    setFeedback({});
    setEvaluatingTaste(true);
    setTasteProgress({ phase: "Evaluating resumes", done: 0, total: batch.length });

    const screened = new Set<string>();
    const MAX_RETRIES = 3;
    let retries = 0;
    let remaining = [...batch];

    try {
      while (remaining.length > 0) {
        try {
          const stream = bulkScreenStream(remaining, compressorPrompt, evaluatorPrompt, "TASTE CHECK — Calibration Batch");
          for await (const event of stream) {
            if (event.type === "result") {
              const d = event.data;
              screened.add(d.filename);
              const tr = toTasteResult(d);
              setTasteResults(prev => prev.map(r => r.filename === d.filename ? tr : r));
              setTasteProgress({ phase: "Evaluating resumes", done: screened.size, total: batch.length });
              if (d.signal_json && d.rating !== "Error") {
                setTasteCandidatePool(prev =>
                  prev.find(c => c.filename === d.filename)
                    ? prev
                    : [...prev, { filename: d.filename, name: d.name, email: d.email ?? null, phone: d.phone ?? null, signal_json: d.signal_json, college_name: (d.signal_json as any)?.college_name, college_tier: (d.signal_json as any)?.college_tier }]
                );
              }
            }
          }
          break;
        } catch (streamErr: any) {
          retries++;
          remaining = remaining.filter(r => !screened.has(r.filename));
          if (remaining.length === 0 || retries > MAX_RETRIES) break;
          console.warn(`[taste] stream interrupted — retrying ${remaining.length} remaining (attempt ${retries}/${MAX_RETRIES})`);
          setTasteProgress({ phase: `Reconnecting… (${remaining.length} left)`, done: screened.size, total: batch.length });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } finally {
      setEvaluatingTaste(false);
      setTasteProgress(null);
    }
  };

  const reEvalCurrentBatch = async (newEvaluatorPrompt: string, batchFilenames: string[], candidatePool: CandidateSignal[]) => {
    const candidates = batchFilenames
      .map(f => candidatePool.find(c => c.filename === f))
      .filter(Boolean) as CandidateSignal[];
    if (candidates.length === 0) return;

    setEvaluatingTaste(true);
    setTasteProgress({ phase: "Re-evaluating with new criteria", done: 0, total: candidates.length });
    setTasteResults(prev => prev.map(r => ({ ...r, result: null, error: undefined })));
    setFeedback({});

    try {
      const stream = bulkEvalStream(candidates, newEvaluatorPrompt);
      for await (const event of stream) {
        if (event.type === "result") {
          const d = event.data;
          const tr = toTasteResult(d);
          setTasteResults(prev => prev.map(r => r.filename === d.filename ? { ...tr, filename: r.filename } : r));
          setTasteProgress({ phase: "Re-evaluating with new criteria", done: event.completed, total: event.total });
        }
      }
    } finally {
      setEvaluatingTaste(false);
      setTasteProgress(null);
    }
  };

  const handleNextBatch = () => {
    if (!paramsDataRef.current || evaluatingTaste) return;
    const remaining = parsedResumes.filter(r => !evaluatedFilenames.has(r.filename));
    if (remaining.length === 0) return;
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
    const next = shuffled.slice(0, 5);
    setReviewIndex(0);
    runBatch(next, paramsDataRef.current.evaluator_prompt, paramsDataRef.current.compressor_prompt);
  };

  const handleTasteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !paramsData) return;
    const files = Array.from(e.target.files);
    e.target.value = "";

    const tasteList = files.map(f => ({ file: f, name: f.name }));
    tasteList.forEach(r => registerFile(r.name, r.file));
    setTasteResumes(tasteList);
    setTasteResults([]);
    setParsedResumes([]);
    setCurrentBatchFilenames([]);
    setEvaluatedFilenames(new Set());
    setTasteParseErrorCount(0);
    setFeedback({});
    setTasteCandidatePool([]);
    setBulkResults([]);
    setReviewIndex(0);
    setConsecutiveAgrees(0);
    setCalibrationComplete(false);
    setTastePoolCount(files.length);
    setTasteProgress({ phase: "Parsing PDFs", done: 0, total: files.length });
    setEvaluatingTaste(true);
    setRecalibrateError(null);

    try {
      const parsed: { text: string; filename: string }[] = [];
      const failedNames: string[] = [];
      const PARSE_BATCH = 8;

      for (let i = 0; i < files.length; i += PARSE_BATCH) {
        const batch = files.slice(i, i + PARSE_BATCH);
        const results = await Promise.all(batch.map(async file => {
          try {
            const res = await uploadPdf(file);
            if (res.error || !res.text) { failedNames.push(file.name); return { ok: false as const }; }
            return { ok: true as const, resume: { text: res.text, filename: file.name } };
          } catch {
            failedNames.push(file.name);
            return { ok: false as const };
          }
        }));
        for (const r of results) {
          if (r.ok) parsed.push(r.resume);
        }
        setTasteProgress({ phase: `Parsing PDFs (${parsed.length + failedNames.length}/${files.length})`, done: parsed.length + failedNames.length, total: files.length });
      }

      if (failedNames.length > 0) {
        setTasteParseErrorCount(failedNames.length);
        setTasteParseFailedNames(failedNames);
        console.warn(`[taste] ${failedNames.length} file(s) failed to parse:`, failedNames);
      } else {
        setTasteParseFailedNames([]);
      }
      if (parsed.length === 0) throw new Error("None of the selected files could be parsed. Ensure they are valid PDF or Word documents.");

      setParsedResumes(parsed);
      setEvaluatingTaste(false);
      setTasteProgress(null);

      // Evaluate first 5 — random sample
      const shuffled = [...parsed].sort(() => Math.random() - 0.5);
      const first5 = shuffled.slice(0, 5);
      await runBatch(first5, paramsData.evaluator_prompt, paramsData.compressor_prompt);
    } catch (err: any) {
      setRecalibrateError(err.message ?? "Taste check failed");
      setEvaluatingTaste(false);
      setTasteProgress(null);
    }
  };

  const handleFeedback = (filename: string, type: "agree" | "disagree_too_high" | "disagree_too_low") => {
    setFeedback(prev => ({ ...prev, [filename]: type }));
  };

  const [recalibrateError, setRecalibrateError] = useState<string | null>(null);
  const [evalPromptDrawerOpen, setEvalPromptDrawerOpen] = useState(false);

  const handleRecalibrate = async () => {
    if (!paramsData) return;
    setRecalibrating(true);
    setRecalibrateError(null);
    try {
      const feedbackWithContext = tasteResults
        .filter(r => feedback[r.filename] || disagreeStage[r.filename]?.target)
        .map(r => {
          const fb = feedback[r.filename];
          const ds = disagreeStage[r.filename];
          const rr = rejectReasons[r.filename];
          const isAgree = fb === "agree";
          const hr_direction = isAgree ? null : ds?.direction ?? (fb === "disagree_too_high" ? "lower" as const : "higher" as const);
          return {
            filename: r.filename,
            decision: r.result?.rating_result?.rating ?? "Unknown",
            reasoning: r.result?.rating_result?.reasoning ?? [],
            hr_agrees: isAgree,
            hr_direction,
            ...(ds?.target ? { hr_target: ds.target } : {}),
            ...(rr?.category?.length && rr?.description?.trim() ? { reject_reason: { category: rr.category.map(id => REJECT_CATEGORIES.find(c => c.id === id)?.label ?? id).join(", "), description: rr.description } } : {}),
          };
        });

      const data = await recalibratePrompt(paramsData.evaluator_prompt, feedbackWithContext);
      if (data.error) throw new Error(data.error);
      if (data.new_evaluator_prompt) {
        const newPrompt = data.new_evaluator_prompt;
        setOriginalEvaluatorPrompt(paramsData.evaluator_prompt);
        const updated = { ...paramsData, evaluator_prompt: newPrompt };
        setParamsData(updated);
        paramsDataRef.current = updated;
        // Compress new prompt and diff against previous
        setPrevCompressedView(compressedView);
        setCompressingView(true);
        compressEvalPrompt(newPrompt)
          .then(cv => setCompressedView(cv))
          .finally(() => setCompressingView(false));
        // Re-evaluate current batch with new prompt
        await reEvalCurrentBatch(newPrompt, currentBatchFilenames, tasteCandidatePool);
      }
    } catch (e: any) {
      setRecalibrateError(e.message ?? "Failed to recalibrate");
    } finally {
      setRecalibrating(false);
    }
  };

  // ── Step 3: Bulk Screen ──
  const runFullScreenFromTastePool = async () => {
    if (!paramsDataRef.current || parsedResumes.length === 0) return;
    const currentParams = paramsDataRef.current;
    setStep(3);
    tasteResumes.forEach(r => registerFile(r.name, r.file));
    setBulkResumes(tasteResumes); // make files available for the viewer
    setScreening(true);
    setBulkResults([]);
    setManualRatingOverrides({});
    setBulkParseErrorCount(tasteParseErrorCount);
    setBulkParseFailedNames(tasteParseFailedNames);
    setBulkUploadTotal(tasteResumes.length);
    setBulkProgress({ phase: "Screening…", done: 0, total: parsedResumes.length });

    const localResults: any[] = [];
    const screened = new Set<string>();
    let remaining = [...parsedResumes];
    const MAX_RETRIES = 3;
    let retries = 0;

    try {
      while (remaining.length > 0) {
        try {
          const stream = bulkScreenStream(remaining, currentParams.compressor_prompt, currentParams.evaluator_prompt, "FULL POOL — Screen All");
          for await (const event of stream) {
            if (event.type === "result") {
              screened.add(event.data.filename);
              localResults.push(event.data);
              setBulkResults(prev => [...prev, event.data]);
              setBulkProgress({ phase: "Screening", done: localResults.length, total: parsedResumes.length });
            }
          }
          break; // stream completed normally
        } catch (streamErr: any) {
          retries++;
          remaining = remaining.filter(r => !screened.has(r.filename));
          if (remaining.length === 0 || retries > MAX_RETRIES) {
            if (remaining.length > 0) throw streamErr; // exhausted retries
            break;
          }
          console.warn(`[screening] stream interrupted — retrying ${remaining.length} remaining (attempt ${retries}/${MAX_RETRIES})`);
          setBulkProgress({ phase: `Reconnecting… (${remaining.length} left)`, done: localResults.length, total: parsedResumes.length });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setScreening(false);
      setBulkProgress(null);
    }
  };

  // Core screening function — shared by the upload zone and the RoleDetail "add more" flow.
  const screenFiles = async (inputFiles: File[]) => {
    if (!paramsData) return;
    // Skip files already screened in this run
    const alreadyScreened = new Set(bulkResults.map((r: any) => r.filename));
    const files = inputFiles.filter(f => !alreadyScreened.has(f.name));
    if (files.length === 0) return;

    const resumeList = files.map(f => ({ file: f, name: f.name }));
    resumeList.forEach(r => registerFile(r.name, r.file));
    setBulkResumes(resumeList);
    setScreening(true);
    if (bulkResults.length === 0) {
      setBulkResults([]);
      setManualRatingOverrides({});
    }
    setBulkParseErrorCount(0);
    setBulkUploadTotal(files.length);
    setBulkProgress({ phase: "Parsing PDFs", done: 0, total: files.length });

    try {
      const parsedResumes: { text: string; filename: string }[] = [];
      const failedFiles: string[] = [];
      const BATCH = 8;
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(async f => {
          try {
            const parsed = await uploadPdf(f);
            if (!parsed.text) { failedFiles.push(f.name); return null; }
            return { text: parsed.text, filename: f.name };
          } catch {
            failedFiles.push(f.name);
            return null;
          }
        }));
        for (const r of results) { if (r) parsedResumes.push(r); }
        setBulkProgress({
          phase: failedFiles.length > 0 ? `Parsing… ${parsedResumes.length} ok, ${failedFiles.length} failed` : `Parsing resumes…`,
          done: parsedResumes.length + failedFiles.length,
          total: files.length,
        });
      }

      if (parsedResumes.length === 0) {
        throw new Error("None of the uploaded files could be parsed. Ensure they are valid PDF or Word documents.");
      }

      if (failedFiles.length > 0) {
        setBulkParseErrorCount(failedFiles.length);
        setBulkParseFailedNames(failedFiles);
      } else {
        setBulkParseFailedNames([]);
      }

      setBulkProgress({ phase: `Screening ${parsedResumes.length} resumes…`, done: 0, total: parsedResumes.length });

      const localResults: any[] = [];
      const screened = new Set<string>();
      let remaining = [...parsedResumes];
      const MAX_RETRIES = 3;
      let retries = 0;

      while (remaining.length > 0) {
        try {
          const stream = bulkScreenStream(remaining, paramsData.compressor_prompt, paramsData.evaluator_prompt, "FULL POOL — Screen All");
          for await (const event of stream) {
            if (event.type === "result") {
              screened.add(event.data.filename);
              localResults.push(event.data);
              setBulkResults(prev => [...prev, event.data]);
              setBulkProgress({ phase: "Screening", done: localResults.length, total: parsedResumes.length });
            }
          }
          break; // stream completed normally
        } catch (streamErr: any) {
          retries++;
          remaining = remaining.filter(r => !screened.has(r.filename));
          if (remaining.length === 0 || retries > MAX_RETRIES) {
            if (remaining.length > 0) throw streamErr;
            break;
          }
          console.warn(`[screening] stream interrupted — retrying ${remaining.length} remaining (attempt ${retries}/${MAX_RETRIES})`);
          setBulkProgress({ phase: `Reconnecting… (${remaining.length} left)`, done: localResults.length, total: parsedResumes.length });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setScreening(false);
      setBulkProgress(null);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !paramsData) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    await screenFiles(files);
  };

  const effectiveRating = (r: any): string => manualRatingOverrides[r.filename] ?? r.rating;

  const prevScreeningRef = React.useRef(false);
  React.useEffect(() => {
    const wasScreening = prevScreeningRef.current;
    prevScreeningRef.current = screening;
    if (!wasScreening || screening) return; // only fires on true→false transition (screening just finished)
    if (bulkResults.length === 0) return;
    const screened = bulkResults.filter(r => effectiveRating(r) !== "Error").length;
    const passed = bulkResults.filter(r => effectiveRating(r) === "P0" || effectiveRating(r) === "P1").length;
    const pct = screened > 0 ? Math.round((passed / screened) * 100) : 0;
    if (pct > 30) setHighPassDialog({ pct, passed, screened });
  }, [screening]);

  const exportCsv = () => {
    if (bulkResults.length === 0) return;
    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const hasRanksForCsv = bulkResults.some(r => r.rank != null);
    const headers = ["Rank", "Score", "Name", "Email", "Phone", "Decision", "AI Decision", "Reason", "Concerns"];
    const rows = [...bulkResults]
      .sort((a, b) => {
        if (hasRanksForCsv) {
          if (a.rank != null && b.rank != null) return a.rank - b.rank;
          if (a.rank != null) return -1;
          if (b.rank != null) return 1;
        }
        const order: Record<string, number> = { P0: 0, P1: 1, Reject: 2, Error: 3 };
        return (order[effectiveRating(a)] ?? 4) - (order[effectiveRating(b)] ?? 4);
      })
      .map(r => [
        escape(r.rank != null ? String(r.rank) : null),
        escape(r.composite_score != null ? String(r.composite_score) : null),
        escape(r.name),
        escape(r.email),
        escape(r.phone),
        escape(effectiveRating(r)),
        escape(manualRatingOverrides[r.filename] ? r.rating : null),
        escape(r.reject_reason ?? (r.reasoning ?? [])[0]),
        escape((r.concerns ?? []).join("; ")),
      ].join(","));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "screening_results.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Build a candidate record from a raw bulk result
  const buildCandidate = (r: any, status: ATSCandidate["status"], overrideTier?: string): ATSCandidate => {
    const sig = (r.signal_json as any) ?? {};
    const latestWork = Array.isArray(sig.work_history) && sig.work_history.length > 0 ? sig.work_history[0] : null;
    const totalMonths: number | null = sig.total_experience_months ?? null;
    const internMonths: number | null = sig.internship_experience_months ?? null;
    const ftMonths: number | null = sig.fulltime_experience_months ?? null;
    return {
      filename: r.filename,
      name: r.name ?? r.filename,
      email: r.email ?? null,
      phone: r.phone ?? null,
      aiRating: r.rating ?? "Error",
      finalRating: overrideTier ?? (manualRatingOverrides[r.filename] ?? r.rating) as string,
      status,
      reason: r.reject_reason ?? (r.reasoning ?? [])[0] ?? null,
      reasoning: r.reasoning ?? [],
      concerns: r.concerns ?? [],
      collegeName: r.college_name ?? sig.college_name ?? null,
      collegeTier: r.college_tier ?? sig.college_tier ?? null,
      currentRole: latestWork?.role ?? null,
      currentCompany: latestWork?.company ?? null,
      yearsExperience: totalMonths != null ? Math.round(totalMonths / 12 * 10) / 10 : null,
      internshipMonths: internMonths,
      fulltimeMonths: ftMonths,
      runAt: new Date().toISOString(),
    };
  };

  // Save any unprocessed bulkResults to the active role as "new" (called on navigate away)
  const savePoolToRole = (targetRoleId: string) => {
    if (bulkResults.length === 0) return;
    setRoles(prev => {
      const updated = prev.map(role => {
        if (role.id !== targetRoleId) return role;
        const existingFns = new Set(role.candidates.map(c => c.filename));
        const toAdd = bulkResults
          .filter(r => !existingFns.has(r.filename))
          .map(r => buildCandidate(r, "new"));
        return toAdd.length ? { ...role, candidates: [...role.candidates, ...toAdd] } : role;
      });
      const updatedRole = updated.find(r => r.id === targetRoleId);
      if (updatedRole) {
        syncRoleToShare(updatedRole);
        if (updatedRole.shareToken) {
          const newFiles = bulkResumes.map(r => r.file).filter(Boolean);
          if (newFiles.length > 0) uploadFilesToShare(newFiles, updatedRole.shareToken);
        }
      }
      return updated;
    });
  };

  const handleShortlistConfirm = (shortlisted: ShortlistEntry[], rejectedFns: string[], savedFns: string[]) => {
    shortlistSentRef.current = true;
    setShowShortlistModal(false);

    const tierMap = Object.fromEntries(shortlisted.map(s => [s.filename, s.tier]));

    const buildWithStatus = (r: any): ATSCandidate => {
      if (tierMap[r.filename]) return buildCandidate(r, "shortlisted", tierMap[r.filename]);
      if (savedFns.includes(r.filename)) return buildCandidate(r, "saved");
      if (rejectedFns.includes(r.filename)) return buildCandidate(r, "rejected");
      return buildCandidate(r, "new");
    };

    if (activeRoleId) {
      setRoles(prev => {
        const updated = prev.map(role => {
          if (role.id !== activeRoleId) return role;
          const existingFns = new Set(role.candidates.map(c => c.filename));
          const bulkFns = new Set(bulkResults.map(r => r.filename));
          const updatedCandidates = role.candidates.map(c =>
            bulkFns.has(c.filename) ? buildWithStatus(bulkResults.find(r => r.filename === c.filename)!) : c
          );
          const toAdd = bulkResults
            .filter(r => !existingFns.has(r.filename))
            .map(buildWithStatus);
          return { ...role, candidates: [...updatedCandidates, ...toAdd] };
        });
        const updatedRole = updated.find(r => r.id === activeRoleId);
        if (updatedRole) {
          syncRoleToShare(updatedRole);
          // Upload any newly screened files to the share store
          if (updatedRole.shareToken) {
            const newFiles = bulkResumes.map(r => r.file).filter(Boolean);
            if (newFiles.length > 0) uploadFilesToShare(newFiles, updatedRole.shareToken);
          }
        }
        return updated;
      });
    }
    setAppView("role-detail");
  };

  const handleDeleteRole = (roleId: string) => {
    setRoles(prev => prev.filter(r => r.id !== roleId));
    if (activeRoleId === roleId) setActiveRoleId(null);
    setAppView("roles");
  };

  const handleUpdateCandidateStatus = (roleId: string, filename: string, status: ATSCandidate["status"]) => {
    setRoles(prev => {
      const updated = prev.map(role =>
        role.id !== roleId ? role :
        { ...role, candidates: role.candidates.map(c => c.filename === filename ? { ...c, status } : c) }
      );
      const updatedRole = updated.find(r => r.id === roleId);
      if (updatedRole) syncRoleToShare(updatedRole);
      return updated;
    });
  };

  const handleBulkUpdateStatus = (roleId: string, filenames: string[], status: ATSCandidate["status"]) => {
    const set = new Set(filenames);
    setRoles(prev => {
      const updated = prev.map(role =>
        role.id !== roleId ? role :
        { ...role, candidates: role.candidates.map(c => set.has(c.filename) ? { ...c, status } : c) }
      );
      const updatedRole = updated.find(r => r.id === roleId);
      if (updatedRole) syncRoleToShare(updatedRole);
      return updated;
    });
  };

  // Reset ALL screener state so a new role gets a completely fresh session
  const resetScreenerState = () => {
    setStep(1);
    setJd("");
    setRoleOverride("");
    setGenerating(false);
    setParamsData(null);
    setGenError(null);
    setJdMode("describe");
    setDescribeRole("");
    setDescribeStatement("");
    setGeneratedJd("");
    setJdGenError(null);
    setTasteResumes([]);
    setTasteResults([]);
    setParsedResumes([]);
    setCurrentBatchFilenames([]);
    setEvaluatedFilenames(new Set());
    setTasteParseErrorCount(0);
    setTasteParseFailedNames([]);
    setEvaluatingTaste(false);
    setTasteProgress(null);
    setTastePoolCount(0);
    setTasteCandidatePool([]);
    setFeedback({});
    setDisagreeStage({});
    setRejectReasons({});
    setReviewIndex(0);
    setInlineRecalibrating(false);
    setConsecutiveAgrees(0);
    setCalibrationComplete(false);
    setTasteIntroSeen(false);
    setBulkResumes([]);
    setBulkResults([]);
    setHighPassDialog(null);
    setScreening(false);
    setBulkProgress(null);
    setBulkParseErrorCount(0);
    setBulkUploadTotal(0);
    setBulkParseFailedNames([]);
    setManualRatingOverrides({});
    setRanking(false);
    setRankingProgress(null);
    setOriginalEvaluatorPrompt(null);
    setCriteria(null);
    setCriteriaApplied({ p0: false, p1: false, dealbreakers: false });
    setRoleQsDone(false);
    setFieldVagueness({ p0: null, p1: null });
    setClarifyingQuestions(null);
    setClarifyingOpen(false);
    setClarifyPendingCriteria(null);
    setClarifyPendingField(null);
    setClarifyingField(null);
    setCompressedView(null);
    setPrevCompressedView(null);
    setCompressingView(false);
    setShowShortlistModal(false);
    shortlistSentRef.current = false;
    try { localStorage.removeItem("rs:state"); } catch {}
  };

  // Restore all saved screener state from a role (called after resetScreenerState so last-write wins)
  const restoreRoleScreenerState = (role: ATSRole) => {
    if (role.params) setParamsData(role.params);
    const ss = role.screenerState;
    if (ss) {
      if (ss.jd) setJd(ss.jd);
      if (ss.describeRole) setDescribeRole(ss.describeRole);
      if (ss.describeStatement) setDescribeStatement(ss.describeStatement);
      if (ss.generatedJd) setGeneratedJd(ss.generatedJd);
      if (ss.criteria) {
        setCriteria(ss.criteria);
        setRoleQsDone(ss.criteria.adjacent_roles_policy != null);
      }
      if (ss.criteriaApplied) setCriteriaApplied(ss.criteriaApplied);
      if (ss.compressedView) setCompressedView(ss.compressedView);
      if (ss.originalEvaluatorPrompt) setOriginalEvaluatorPrompt(ss.originalEvaluatorPrompt);
    } else {
      // First time opening screener for this role — pre-fill role name from the ATS role title
      setDescribeRole(role.title);
    }
  };

  // Helper: navigate away from screener, auto-save pool if not yet shortlisted
  const leaveScreener = (dest: AppView) => {
    if (bulkResults.length > 0 && activeRoleId && !shortlistSentRef.current) {
      savePoolToRole(activeRoleId);
    }
    setAppView(dest);
  };

  // Helper: sync a role to the backend share store if it has a shareToken
  const syncRoleToShare = (role: ATSRole) => {
    if (!role.shareToken) return;
    updateShare(role.shareToken, role).catch(() => {});
  };

  // Helper: upload files to the backend share store for the active role
  const uploadFilesToShare = (files: File[], shareToken: string) => {
    uploadShareFiles(shareToken, files).catch(() => {});
  };

  // Helper: load all candidate files for a role from memory/IDB and upload to share store.
  // Returns { uploaded, missing } — missing means file not in memory or IDB on this device.
  const uploadAllRoleFilesToShare = async (
    role: ATSRole,
    shareToken: string,
  ): Promise<{ uploaded: number; missing: number }> => {
    const files: File[] = [];
    let missing = 0;
    for (const c of role.candidates) {
      const mem = allFilesRef.current.get(c.filename)
        ?? bulkResumes.find(r => r.name === c.filename)?.file
        ?? tasteResumes.find(r => r.name === c.filename)?.file;
      if (mem) { files.push(mem); continue; }
      const fromIdb = await idbGetFile(c.filename);
      if (fromIdb) { files.push(fromIdb); continue; }
      missing++;
    }
    // Upload in batches of 5 to avoid oversized requests
    const BATCH = 5;
    for (let i = 0; i < files.length; i += BATCH) {
      await uploadShareFiles(shareToken, files.slice(i, i + BATCH));
    }
    return { uploaded: files.length, missing };
  };

  // ── ATS view guards — early return before the screener shell ──────────────

  if (shareLoadState === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 gap-4">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin" />
        <p className="text-sm text-neutral-500">Loading shared role…</p>
      </div>
    );
  }

  if (shareLoadState === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 gap-3">
        <p className="text-base font-semibold text-neutral-800">This share link has expired or is no longer available.</p>
        <p className="text-sm text-neutral-400">The person who shared it may need to re-share.</p>
      </div>
    );
  }

  if (appView === "roles") {
    return (
      <RolesList
        roles={roles}
        onNewRole={() => setAppView("create-role")}
        onOpenRole={id => { setActiveRoleId(id); setAppView("role-detail"); }}
        onDeleteRole={handleDeleteRole}
        onChangeCriteria={(roleId) => {
          const role = roles.find(r => r.id === roleId)!;
          setActiveRoleId(roleId);
          resetScreenerState();
          restoreRoleScreenerState(role);
          setStep(1);
          setAppView("screener");
        }}
        onShareRole={async (roleId) => {
          const role = roles.find(r => r.id === roleId)!;
          const token = role.shareToken ?? (await createShare(role)).token;
          const roleWithToken = { ...role, shareToken: token };
          updateShare(token, roleWithToken).catch(() => {});
          if (!role.shareToken) {
            setRoles(prev => prev.map(r => r.id === roleId ? { ...r, shareToken: token } : r));
          }
          await uploadAllRoleFilesToShare(roleWithToken, token);
          return `${window.location.origin}/role/${token}`;
        }}
      />
    );
  }

  if (appView === "create-role") {
    return (
      <CreateRole
        onBack={() => setAppView("roles")}
        onCreate={(title, department) => {
          const newRole: ATSRole = {
            id: `role_${Date.now()}`,
            title,
            department,
            createdAt: new Date().toISOString(),
            status: "active",
            candidates: [],
          };
          setRoles(prev => [newRole, ...prev]);
          setActiveRoleId(newRole.id);
          setAppView("role-detail");
        }}
      />
    );
  }

  if (appView === "role-detail") {
    const activeRole = roles.find(r => r.id === activeRoleId) ?? null;
    if (!activeRole) return null;
    return (
      <>
        <RoleDetail
          role={activeRole}
          onBack={() => setAppView("roles")}
          onNewShortlist={() => {
            resetScreenerState();
            restoreRoleScreenerState(activeRole);
            setStep(activeRole.params ? 3 : 1);
            setAppView("screener");
          }}
          onAddMoreResumes={(files) => {
            files.forEach(f => registerFile(f.name, f));
            pendingUploadRef.current = files;
            restoreRoleScreenerState(activeRole);
            setStep(activeRole.params ? 3 : 1);
            setAppView("screener");
          }}
          onDelete={() => handleDeleteRole(activeRole.id)}
          onUpdateStatus={(filename, status) => handleUpdateCandidateStatus(activeRole.id, filename, status)}
          onBulkUpdateStatus={(filenames, status) => handleBulkUpdateStatus(activeRole.id, filenames, status)}
          onShare={async () => {
            const token = activeRole.shareToken ?? (await createShare(activeRole)).token;
            const roleWithToken = { ...activeRole, shareToken: token };
            updateShare(token, roleWithToken).catch(() => {});
            if (!activeRole.shareToken) {
              setRoles(prev => prev.map(r => r.id === activeRole.id ? { ...r, shareToken: token } : r));
            }
            const { uploaded, missing } = await uploadAllRoleFilesToShare(roleWithToken, token);
            return { url: `${window.location.origin}/role/${token}`, filesUploaded: uploaded, filesMissing: missing };
          }}
          onViewResume={async (filename) => {
            const file = await findResumeFile(filename, activeRole.shareToken);
            if (!file) { alert("Resume file not available."); return; }
            const bulkResult = bulkResults.find(r => r.filename === filename);
            const candidate = activeRole.candidates.find(c => c.filename === filename);
            const result = bulkResult ?? (candidate ? {
              name: candidate.name,
              rating: candidate.aiRating,
              reject_reason: candidate.reason,
              reasoning: candidate.reasoning,
              concerns: candidate.concerns,
            } : {});
            const url = URL.createObjectURL(file);
            setResumeModal({ url, result });
          }}
        />
        {resumeModal && (
          <ResumeModalOverlay url={resumeModal.url} result={resumeModal.result} onClose={closeResumeModal} />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen flex bg-white font-sans text-neutral-900">

      {/* ── Dark Sidebar ── */}
      <aside className="w-60 bg-neutral-900 text-neutral-300 flex flex-col shrink-0 min-h-screen">
        {/* All Roles button — top of sidebar */}
        <div className="px-4 pt-4 pb-3 border-b border-neutral-800">
          <button
            onClick={() => leaveScreener("roles")}
            className="flex items-center gap-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors w-full text-left"
          >
            <span className="text-base leading-none">←</span>
            <span>All Roles</span>
          </button>
        </div>
        <div className="px-6 pt-5 pb-5 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-emerald-700 flex items-center justify-center">
              <Award className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white tracking-tight">Screener</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 pt-6">
          <button
            onClick={() => setStep(1)}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left ${
              step === 1
                ? "border-l-2 border-emerald-500 pl-[10px] text-white bg-neutral-800"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span className="text-xs font-bold opacity-50">01</span>
            <span className="font-medium">Define Role</span>
          </button>
          <button
            onClick={() => paramsData?.evaluator_prompt ? setStep(2) : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left ${
              step === 2
                ? "border-l-2 border-emerald-500 pl-[10px] text-white bg-neutral-800"
                : paramsData?.evaluator_prompt
                ? "text-neutral-400 hover:text-neutral-200"
                : "text-neutral-600 cursor-default"
            }`}
          >
            <span className="text-xs font-bold opacity-50">02</span>
            <span className="font-medium">Calibrate Taste</span>
          </button>
          <button
            onClick={() => paramsData?.evaluator_prompt ? setStep(3) : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left ${
              step === 3
                ? "border-l-2 border-emerald-500 pl-[10px] text-white bg-neutral-800"
                : paramsData?.evaluator_prompt
                ? "text-neutral-400 hover:text-neutral-200"
                : "text-neutral-600 cursor-default"
            }`}
          >
            <span className="text-xs font-bold opacity-50">03</span>
            <span className="font-medium">Screen Pool</span>
          </button>
        </nav>
        <div className="mt-auto px-6 pb-8">
          <p className="text-[11px] text-neutral-600 leading-relaxed">You set the bar. We screen everyone else.</p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Step progress header */}
        <div className="px-8 border-b border-neutral-200 shrink-0">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3 text-sm font-medium">
              <span className={step === 1 ? "text-neutral-900" : "text-neutral-400"}>1. Review criteria</span>
              <span className="text-neutral-300">·</span>
              <span className={step === 2 ? "text-neutral-900" : "text-neutral-400"}>2. Calibrate taste</span>
              <span className="text-neutral-300">·</span>
              <span className={step === 3 ? "text-neutral-900" : "text-neutral-400"}>3. Screen pool</span>
            </div>
            {step === 3 && (
              <button
                onClick={exportCsv}
                disabled={bulkResults.length === 0}
                className="flex items-center gap-2 px-4 py-1.5 bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
          </div>
        </div>

      <main className="flex-1 overflow-y-auto px-8 py-8">


        {/* ── STEP 1: Criteria ── */}
        {step === 1 && (
          <>
            {/* ── JD ENTRY (before criteria generated) ── */}
            {!paramsData && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="max-w-2xl mx-auto pt-8 pb-24"
              >
                <div className="mb-10">
                  <h1 className="font-serif text-5xl text-neutral-900 leading-tight mb-3">Define the role.</h1>
                  <p className="text-sm text-neutral-500">Describe what you're looking for. We'll build the screening criteria.</p>
                </div>

                {/* Mode tabs */}
                <div className="flex gap-0 border-b border-neutral-200 mb-8">
                  <button
                    onClick={() => setJdMode("describe")}
                    className={`pb-3 px-1 mr-6 text-sm font-medium transition-colors border-b-2 -mb-px ${jdMode === "describe" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-700"}`}
                  >
                    Describe it
                  </button>
                  <button
                    onClick={() => setJdMode("paste")}
                    className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 -mb-px ${jdMode === "paste" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400 hover:text-neutral-700"}`}
                  >
                    Paste JD
                  </button>
                </div>

                <div className="flex flex-col gap-8">
                  {jdMode === "describe" ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Role Name</label>
                        <input
                          type="text"
                          value={describeRole}
                          onChange={e => setDescribeRole(e.target.value)}
                          placeholder="e.g. Product Manager, Growth Analyst, SWE-2"
                          className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 placeholder-neutral-300 transition-colors"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">What are you looking for?</label>
                        <textarea
                          value={describeStatement}
                          onChange={e => setDescribeStatement(e.target.value)}
                          placeholder="e.g. Someone with 2+ yrs of product experience, tier 1 college preferred, strong ownership and metrics-driven."
                          className="w-full text-sm border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 placeholder-neutral-300 leading-relaxed resize-none pb-2 transition-colors"
                          rows={3}
                        />
                        <p className="text-[11px] text-neutral-400">Hindi, English, or Hinglish all work.</p>
                      </div>
                      {jdGenError && <p className="text-xs text-red-600">{jdGenError}</p>}
                      {!generatedJd ? (
                        <div className="flex">
                          <button
                            onClick={handleGenerateJd}
                            disabled={generatingJd || !describeRole.trim() || !describeStatement.trim()}
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {generatingJd ? <><Loader2 className="w-4 h-4 animate-spin" />Generating JD…</> : <>Generate JD <ArrowRight className="w-4 h-4" /></>}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Generated JD</label>
                              <button
                                onClick={() => { setGeneratedJd(""); setJd(""); }}
                                className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors"
                              >
                                Regenerate
                              </button>
                            </div>
                            <textarea
                              value={generatedJd}
                              onChange={e => { setGeneratedJd(e.target.value); setJd(e.target.value); }}
                              className="w-full text-xs font-mono leading-relaxed border border-neutral-200 p-3 text-neutral-700 focus:outline-none focus:border-emerald-700 transition-colors resize-y bg-neutral-50"
                              rows={8}
                            />
                          </div>
                          <div className="flex">
                            <button
                              onClick={handleGenerate}
                              disabled={generating || !jd.trim()}
                              className="flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Building Criteria…</> : <>Generate Criteria <ArrowRight className="w-4 h-4" /></>}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Job Description</label>
                        <textarea
                          value={jd}
                          onChange={e => setJd(e.target.value)}
                          placeholder="Paste the complete job description here..."
                          className="w-full text-sm border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 placeholder-neutral-300 leading-relaxed resize-none pb-2 transition-colors"
                          rows={10}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Role Title Override <span className="text-neutral-300 normal-case font-normal">(optional)</span></label>
                        <input
                          type="text"
                          value={roleOverride}
                          onChange={e => setRoleOverride(e.target.value)}
                          placeholder="e.g. Senior Product Manager"
                          className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 placeholder-neutral-300 transition-colors"
                        />
                      </div>
                      {genError && <p className="text-xs text-red-600">{genError}</p>}
                      <div className="flex">
                        <button
                          onClick={handleGenerate}
                          disabled={generating || !jd.trim()}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing Role…</> : <>Generate Criteria <ArrowRight className="w-4 h-4" /></>}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── CRITERIA FORM (after criteria generated) ── */}
            {paramsData && criteria && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="max-w-[1200px] mx-auto grid grid-cols-2 gap-24 pb-24 pt-4"
              >

                {/* LEFT: Criteria form */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Criteria</h2>
                    <button
                      onClick={() => { setParamsData(null); setGeneratedJd(""); }}
                      className="px-2.5 py-1 text-xs font-medium text-neutral-500 border border-neutral-200 hover:text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
                    >
                      ← Change role
                    </button>
                  </div>

                  <div className="flex flex-col gap-8 overflow-y-auto" style={{ maxHeight: "calc(100vh - 160px)" }}>

                    {/* Role title + seniority + experience */}
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Role Title</label>
                        <input
                          type="text"
                          value={criteria.role_title}
                          onChange={e => updateCriteria(c => ({ ...c, role_title: e.target.value }))}
                          placeholder="e.g. Product Manager"
                          className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 placeholder-neutral-300 transition-colors"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-8">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Seniority</label>
                          <select
                            value={criteria.seniority}
                            onChange={e => {
                              const s = e.target.value;
                              const isFresher = s === "intern" || s === "junior";
                              updateCriteria(c => ({
                                ...c,
                                seniority: s,
                                min_experience_months: s === "intern" ? 0 : c.min_experience_months,
                                min_internship_months: isFresher ? (c.min_internship_months ?? 0) : undefined,
                              }));
                            }}
                            className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 cursor-pointer transition-colors"
                          >
                            {["intern", "junior", "mid", "senior", "lead", "principal", "director"].map(v => (
                              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                        {criteria.seniority === "intern" ? (
                          /* Intern: internship bar replaces full-time bar entirely */
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Min Internship Exp</label>
                            <select
                              value={String(criteria.min_internship_months ?? 0)}
                              onChange={e => {
                                const v = e.target.value;
                                updateCriteria(c => ({ ...c, min_internship_months: v === "same_as_fulltime" || v === "not_applicable" ? v : Number(v) }));
                              }}
                              className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 cursor-pointer transition-colors"
                            >
                              <option value="not_applicable">Not applicable — full-time required</option>
                              <option value="0">No minimum</option>
                              <option value="1">1 month</option>
                              <option value="2">2 months</option>
                              <option value="3">3 months</option>
                              <option value="6">6 months</option>
                            </select>
                          </div>
                        ) : (
                          /* Non-intern: full-time bar */
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Min Experience</label>
                            <select
                              value={criteria.min_experience_months}
                              onChange={e => updateCriteria(c => ({ ...c, min_experience_months: Number(e.target.value) }))}
                              className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 cursor-pointer transition-colors"
                            >
                              {EXP_OPTIONS.map(m => (
                                <option key={m} value={m}>{formatExpMonths(m)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                      {/* Junior: also show internship bar for fresher candidates */}
                      {criteria.seniority === "junior" && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                            Fresher / Internship Bar
                            <span className="ml-1.5 text-neutral-300 font-normal normal-case tracking-normal">for candidates fresh out of college</span>
                          </label>
                          <select
                            value={String(criteria.min_internship_months ?? 0)}
                            onChange={e => {
                              const v = e.target.value;
                              updateCriteria(c => ({ ...c, min_internship_months: v === "same_as_fulltime" || v === "not_applicable" ? v : Number(v) }));
                            }}
                            className="w-full text-sm pb-2 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 cursor-pointer transition-colors"
                          >
                            <option value="not_applicable">Not applicable — freshers must have full-time exp</option>
                            <option value="0">No minimum — any fresher is fine</option>
                            <option value="1">1 month internship</option>
                            <option value="2">2 months internship</option>
                            <option value="3">3 months internship</option>
                            <option value="6">6 months internship</option>
                            <option value="same_as_fulltime">Same as full-time bar</option>
                          </select>
                          <p className="text-[10px] text-neutral-400 leading-relaxed">
                            {criteria.min_internship_months === "not_applicable"
                              ? "Freshers with only internship experience will be rejected. Full-time work is required."
                              : criteria.min_internship_months === "same_as_fulltime"
                              ? `Freshers need at least ${formatExpMonths(criteria.min_experience_months)} of internship experience to qualify.`
                              : criteria.min_internship_months === 0 || criteria.min_internship_months == null
                              ? "Freshers with any amount of internship experience qualify. Full-time experience as a fresher is a strong P0 signal."
                              : `Freshers need at least ${criteria.min_internship_months} month${criteria.min_internship_months === 1 ? "" : "s"} of internship. Full-time experience as a fresher is a strong P0 signal.`
                            }
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Role Fit Signals — shown before editing signals */}
                    <AnimatePresence>
                      {!roleQsDone && criteria && (
                        <motion.div
                          key="role-qs-panel"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.3 }}
                          className="rounded-xl border border-[#E5E7EB] bg-white"
                        >
                          {/* Header */}
                          <div className="px-5 py-3 border-b border-[#F3F4F6]">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Role Fit Signals</p>
                            <p className="text-xs text-neutral-400 mt-0.5">Quick decisions on edge cases — you can always change later</p>
                          </div>

                          {/* Rows */}
                          <div className="divide-y divide-[#F3F4F6]">
                            {ROLE_CONTEXT_QUESTIONS.map(q => {
                              const currentVal = criteria[q.field] as string | undefined;

                              // experience_surplus uses "reject_over_N" pattern
                              const isRejectWithThreshold = q.rejectRequiresInput && !!currentVal && currentVal.startsWith("reject_over_");
                              const rejectYearsValue = isRejectWithThreshold ? currentVal!.replace("reject_over_", "") : "";

                              const isCustomLoaded = !!currentVal && currentVal !== "ignore" && currentVal !== q.rejectValue && !isRejectWithThreshold;
                              const isSpecify = !q.rejectRequiresInput && (!!roleQsCustomMode[q.id] || isCustomLoaded);
                              const isRejectInputOpen = q.rejectRequiresInput && (!!roleQsRejectInputMode[q.id] || isRejectWithThreshold);
                              const isReject = isRejectWithThreshold || (!isSpecify && !isRejectInputOpen && currentVal === q.rejectValue);
                              const isOK = !isSpecify && !isReject && !isRejectInputOpen;

                              const context =
                                q.id === "seniority_mismatch"
                                  ? getOverqualifiedContext(criteria.seniority || "")
                                  : q.id === "adjacent_roles"
                                  ? (getAdjacentRoleExamples(criteria.role_title) ?? undefined)
                                  : q.staticContext;
                              const consequence = q.consequence.replace("{role_title}", criteria.role_title || "this role");

                              const isActive = isReject || isRejectInputOpen;
                              const borderClass = isActive
                                ? "border-l-[#DC262666]"
                                : isSpecify
                                ? "border-l-[#5B4FE866]"
                                : "border-l-transparent";
                              const consequenceColor = isActive
                                ? "text-[#DC2626]"
                                : isSpecify
                                ? "text-[#5B4FE8]"
                                : "text-[#9CA3AF]";

                              return (
                                <div
                                  key={q.id}
                                  className={`flex items-start gap-4 px-5 py-3 border-l-2 transition-colors ${borderClass}`}
                                >
                                  {/* Left */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[#111827]">{q.label}</p>
                                    {context && <p className="text-xs text-[#6B7280] mt-0.5">{context}</p>}
                                    <p className={`text-xs mt-1.5 transition-colors ${consequenceColor}`}>→ {consequence}</p>
                                    <AnimatePresence>
                                      {isRejectInputOpen && (
                                        <motion.div
                                          key="reject-years-input"
                                          initial={{ opacity: 0, maxHeight: 0 }}
                                          animate={{ opacity: 1, maxHeight: 60 }}
                                          exit={{ opacity: 0, maxHeight: 0 }}
                                          transition={{ duration: 0.2, ease: "easeOut" }}
                                          className="overflow-hidden"
                                        >
                                          <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-neutral-500 shrink-0">Reject if more than</span>
                                            <input
                                              type="number"
                                              min={0}
                                              autoFocus={!!roleQsRejectInputMode[q.id]}
                                              value={rejectYearsValue}
                                              onChange={e => {
                                                const v = e.target.value;
                                                updateCriteria(c => ({ ...c, [q.field]: v ? `reject_over_${v}` : "ignore" }));
                                              }}
                                              placeholder="0"
                                              className="w-16 h-8 px-2 rounded-lg border border-[#D1D5DB] text-[13px] text-neutral-700 bg-white outline-none focus:border-[#DC2626] transition-colors text-center"
                                            />
                                            <span className="text-xs text-neutral-500 shrink-0">years of experience</span>
                                          </div>
                                        </motion.div>
                                      )}
                                      {isSpecify && (
                                        <motion.div
                                          key="specify-input"
                                          initial={{ opacity: 0, maxHeight: 0 }}
                                          animate={{ opacity: 1, maxHeight: 60 }}
                                          exit={{ opacity: 0, maxHeight: 0 }}
                                          transition={{ duration: 0.2, ease: "easeOut" }}
                                          className="overflow-hidden"
                                        >
                                          <input
                                            type="text"
                                            autoFocus={!!roleQsCustomMode[q.id]}
                                            value={(currentVal as string) || ""}
                                            onChange={e => updateCriteria(c => ({ ...c, [q.field]: e.target.value }))}
                                            placeholder="Describe how you want to handle this — e.g. flag as concern but don't auto-reject"
                                            className="w-full mt-2 h-8 px-3 rounded-lg border border-[#D1D5DB] text-[13px] text-neutral-700 bg-white outline-none focus:border-[#5B4FE8] transition-colors placeholder-neutral-300"
                                          />
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                  {/* Right — buttons */}
                                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                    <button
                                      onClick={() => {
                                        if (q.rejectRequiresInput) {
                                          setRoleQsRejectInputMode(prev => ({ ...prev, [q.id]: true }));
                                          setRoleQsCustomMode(prev => ({ ...prev, [q.id]: false }));
                                          if (!isRejectWithThreshold) updateCriteria(c => ({ ...c, [q.field]: "ignore" }));
                                        } else {
                                          updateCriteria(c => ({ ...c, [q.field]: q.rejectValue }));
                                          setRoleQsCustomMode(prev => ({ ...prev, [q.id]: false }));
                                        }
                                      }}
                                      className={`h-7 px-2.5 rounded text-xs font-medium border transition-colors ${
                                        isReject || isRejectInputOpen
                                          ? "bg-[#DC2626] border-[#DC2626] text-white"
                                          : "bg-white border-[#D1D5DB] text-[#111827] hover:border-[#DC2626] hover:text-[#DC2626]"
                                      }`}
                                    >Reject</button>
                                    <button
                                      onClick={() => {
                                        updateCriteria(c => ({ ...c, [q.field]: "ignore" }));
                                        setRoleQsCustomMode(prev => ({ ...prev, [q.id]: false }));
                                        setRoleQsRejectInputMode(prev => ({ ...prev, [q.id]: false }));
                                      }}
                                      className={`h-7 px-2.5 rounded text-xs font-medium border transition-colors ${
                                        isOK
                                          ? "bg-[#111827] border-[#111827] text-white"
                                          : "bg-white border-[#D1D5DB] text-[#111827] hover:border-[#111827]"
                                      }`}
                                    >OK</button>
                                    <button
                                      onClick={() => {
                                        setRoleQsCustomMode(prev => ({ ...prev, [q.id]: true }));
                                        setRoleQsRejectInputMode(prev => ({ ...prev, [q.id]: false }));
                                        if (!isCustomLoaded) updateCriteria(c => ({ ...c, [q.field]: "" }));
                                      }}
                                      className={`h-7 px-2.5 rounded text-xs font-medium border transition-colors ${
                                        isSpecify
                                          ? "bg-[#5B4FE8] border-[#5B4FE8] text-white"
                                          : "bg-white border-[#D1D5DB] text-[#111827] hover:border-[#5B4FE8] hover:text-[#5B4FE8]"
                                      }`}
                                    >Specify</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Footer */}
                          <div className="px-5 py-3 border-t border-[#F3F4F6] flex items-center justify-between">
                            <button
                              onClick={() => {
                                setRoleQsCustomMode({});
                                setRoleQsRejectInputMode({});
                                updateCriteria(c => ({
                                  ...c,
                                  adjacent_roles_policy: "ignore",
                                  seniority_mismatch_policy: "ignore",
                                  experience_surplus_policy: "ignore",
                                }));
                                setRoleQsDone(true);
                              }}
                              className="text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
                            >Skip all →</button>
                            <button
                              onClick={() => setRoleQsDone(true)}
                              className="px-4 py-2 rounded-xl bg-[#111827] text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
                            >Continue to Signals →</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Signals section */}
                    <AnimatePresence>
                    {roleQsDone && (
                    <motion.div
                      key="signals-wrapper"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-neutral-900">Signals</h3>
                        <button
                          onClick={() => setRoleQsDone(false)}
                          className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                        >← Role fit signals</button>
                      </div>

                      {/* P0 */}
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className={`border p-4 transition-colors ${criteriaApplied.p0 ? "border-neutral-200 bg-neutral-50/60" : "border-neutral-200 bg-white"}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-emerald-900 flex items-center gap-2">
                            P0 <span className="text-xs text-neutral-400 font-normal">— Strong Hire</span>
                          </div>
                          {criteriaApplied.p0 && <span className="flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="w-3 h-3" /> Applied</span>}
                        </div>
                        <AutoTextarea
                          value={criteria.p0_text}
                          onChange={e => { updateCriteria(c => ({ ...c, p0_text: e.target.value })); setCriteriaApplied(prev => ({ ...prev, p0: false })); }}
                          placeholder="What makes someone an immediate yes? Describe in natural language."
                          className={`w-full text-sm bg-transparent outline-none border-b pb-1 transition-colors border-emerald-200 focus:border-emerald-600 ${criteriaApplied.p0 ? "opacity-60" : ""}`}
                          style={{ minHeight: "3.5rem" }}
                        />
                        {/* P0 pedigree */}
                        {(() => {
                          const asArr = (v: string[]): string[] => v?.length ? v : ["no_preference"];
                          const toggle = (field: "p0_education_pedigree" | "p0_company_pedigree", val: string) => {
                            updateCriteria(c => {
                              const cur = asArr(c[field]);
                              if (val === "no_preference") return { ...c, [field]: ["no_preference"], ...(field === "p0_education_pedigree" ? { p0_education_tier2_skills: undefined } : {}) };
                              const without = cur.filter(v => v !== "no_preference");
                              const next = without.includes(val) ? without.filter(v => v !== val) : [...without, val];
                              const result = next.length ? next : ["no_preference"];
                              if (field === "p0_education_pedigree" && !result.includes("tier2_exception")) {
                                return { ...c, [field]: result, p0_education_tier2_skills: undefined };
                              }
                              return { ...c, [field]: result };
                            });
                            setCriteriaApplied(prev => ({ ...prev, p0: false }));
                          };
                          const eduChips = [
                            { value: "tier_1", label: "Tier 1" },
                            { value: "tier_2", label: "Tier 2" },
                            { value: "no_preference", label: "Any" },
                            { value: "tier2_exception", label: "Tier 2 + skills" },
                          ];
                          const compChips = [{ value: "tier_1", label: "Tier 1" }, { value: "tier_2", label: "Tier 2" }, { value: "no_preference", label: "Any" }];
                          const eduArr = asArr(criteria.p0_education_pedigree);
                          const compArr = asArr(criteria.p0_company_pedigree);
                          const hasTier2Exception = eduArr.includes("tier2_exception");
                          return (
                            <div className="mt-3 flex flex-col gap-3">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Education</span>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {eduChips.map(opt => (
                                      <button key={opt.value} onClick={() => toggle("p0_education_pedigree", opt.value)}
                                        className={`text-[11px] font-medium px-2 py-0.5 border transition-colors ${eduArr.includes(opt.value) ? (opt.value === "tier2_exception" ? "bg-sky-700 border-sky-700 text-white" : "bg-emerald-700 border-emerald-700 text-white") : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}
                                      >{opt.label}</button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Company</span>
                                  <div className="flex gap-1.5 flex-wrap">
                                    {compChips.map(opt => (
                                      <button key={opt.value} onClick={() => toggle("p0_company_pedigree", opt.value)}
                                        className={`text-[11px] font-medium px-2 py-0.5 border transition-colors ${compArr.includes(opt.value) ? "bg-emerald-700 border-emerald-700 text-white" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}
                                      >{opt.label}</button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {hasTier2Exception && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-sky-700 font-semibold">Skills that compensate for Tier 2 college</span>
                                  <input
                                    type="text"
                                    value={criteria.p0_education_tier2_skills ?? ""}
                                    onChange={e => { updateCriteria(c => ({ ...c, p0_education_tier2_skills: e.target.value })); setCriteriaApplied(prev => ({ ...prev, p0: false })); }}
                                    placeholder="e.g. React, Django, production ML pipelines"
                                    className="w-full text-xs border border-sky-200 focus:border-sky-500 outline-none px-2.5 py-1.5 text-neutral-700"
                                  />
                                  <p className="text-[10px] text-neutral-400 leading-relaxed">Tier 1 is preferred; a Tier 2 candidate qualifies for P0 only if they clearly demonstrate these skills in their work history.</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {!criteriaApplied.p0 && (
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => requestFieldClarification("p0")}
                              disabled={!criteria.p0_text.trim() || clarifyingField !== null}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium px-4 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {clarifyingField === "p0" ? "Checking..." : "Apply P0"}
                            </button>
                          </div>
                        )}
                      </motion.div>

                      {/* P1 — after P0 applied, or stays if P1 text already entered */}
                      <AnimatePresence>
                        {(criteriaApplied.p0 || !!criteria?.p1_text) && (
                          <motion.div
                            key="p1-box"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.25 }}
                            className={`border p-4 transition-colors ${criteriaApplied.p1 ? "border-neutral-200 bg-neutral-50/60" : "border-neutral-200 bg-white"}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium text-amber-900 flex items-center gap-2">
                                P1 <span className="text-xs text-neutral-400 font-normal">— Potential Hire</span>
                              </div>
                              {criteriaApplied.p1 && <span className="flex items-center gap-1 text-xs font-medium text-amber-700"><Check className="w-3 h-3" /> Applied</span>}
                            </div>
                            <AutoTextarea
                              value={criteria.p1_text}
                              onChange={e => { updateCriteria(c => ({ ...c, p1_text: e.target.value })); setCriteriaApplied(prev => ({ ...prev, p1: false })); }}
                              placeholder="Worth a slot even with one gap. What signals qualify?"
                              className={`w-full text-sm bg-transparent outline-none border-b pb-1 transition-colors border-amber-200 focus:border-amber-600 ${criteriaApplied.p1 ? "opacity-60" : ""}`}
                              style={{ minHeight: "3.5rem" }}
                            />
                            {/* P1 pedigree */}
                            {(() => {
                              const asArr = (v: string[]): string[] => v?.length ? v : ["no_preference"];
                              const toggle = (field: "p1_education_pedigree" | "p1_company_pedigree", val: string) => {
                                updateCriteria(c => {
                                  const cur = asArr(c[field]);
                                  if (val === "no_preference") return { ...c, [field]: ["no_preference"] };
                                  const without = cur.filter(v => v !== "no_preference");
                                  const next = without.includes(val) ? without.filter(v => v !== val) : [...without, val];
                                  return { ...c, [field]: next.length ? next : ["no_preference"] };
                                });
                                setCriteriaApplied(prev => ({ ...prev, p1: false }));
                              };
                              const chips = [{ value: "tier_1", label: "Tier 1" }, { value: "tier_2", label: "Tier 2" }, { value: "no_preference", label: "Any" }];
                              const eduArr = asArr(criteria.p1_education_pedigree);
                              const compArr = asArr(criteria.p1_company_pedigree);
                              return (
                                <div className="mt-3 grid grid-cols-2 gap-4">
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Education</span>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {chips.map(opt => (
                                        <button key={opt.value} onClick={() => toggle("p1_education_pedigree", opt.value)}
                                          className={`text-[11px] font-medium px-2 py-0.5 border transition-colors ${eduArr.includes(opt.value) ? "bg-amber-600 border-amber-600 text-white" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}
                                        >{opt.label}</button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Company</span>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {chips.map(opt => (
                                        <button key={opt.value} onClick={() => toggle("p1_company_pedigree", opt.value)}
                                          className={`text-[11px] font-medium px-2 py-0.5 border transition-colors ${compArr.includes(opt.value) ? "bg-amber-600 border-amber-600 text-white" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}
                                        >{opt.label}</button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            {/* P0/P1 similarity warning (LLM-based, debounced) */}
                            {p0p1SimilarityWarning && (
                              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-300 p-3">
                                <span className="text-amber-600 text-sm font-bold shrink-0 leading-none mt-0.5">⚠</span>
                                <div>
                                  <p className="text-xs font-semibold text-amber-800">P0 and P1 overlap — your tiers won't separate</p>
                                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Anyone clearing P1 will also clear P0, there is no real differentiation. Either tighten P0 to a higher bar, or loosen P1 so candidates with one clear gap can still qualify.</p>
                                </div>
                              </div>
                            )}
                            {!criteriaApplied.p1 && (
                              <div className="mt-3 flex justify-end">
                                <button
                                  onClick={() => requestFieldClarification("p1")}
                                  disabled={!criteria.p1_text.trim() || clarifyingField !== null}
                                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-4 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {clarifyingField === "p1" ? "Checking..." : "Apply P1"}
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Dealbreakers — after P1 applied, or stays if dealbreakers text already entered */}
                      <AnimatePresence>
                        {((criteriaApplied.p0 && criteriaApplied.p1) || !!criteria?.dealbreakers) && (
                          <motion.div
                            key="dealbreakers-box"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.25 }}
                            className={`border p-4 transition-colors ${criteriaApplied.dealbreakers ? "border-neutral-200 bg-neutral-50/60" : "border-neutral-200 bg-white"}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium text-rose-900 flex items-center gap-2">
                                Minimum Eligibility Requirement
                              </div>
                              {criteriaApplied.dealbreakers && <span className="flex items-center gap-1 text-xs font-medium text-rose-600"><Check className="w-3 h-3" /> Applied</span>}
                            </div>
                            <AutoTextarea
                              value={criteria.dealbreakers}
                              onChange={e => { updateCriteria(c => ({ ...c, dealbreakers: e.target.value })); setCriteriaApplied(prev => ({ ...prev, dealbreakers: false })); }}
                              placeholder="What disqualifies someone outright? Hard requirements and automatic rejects."
                              className={`w-full text-sm bg-transparent outline-none border-b border-rose-200 focus:border-rose-600 pb-1 transition-colors ${criteriaApplied.dealbreakers ? "opacity-60" : ""}`}
                              style={{ minHeight: "3rem" }}
                            />
                            {!criteriaApplied.dealbreakers && (
                              <div className="mt-3 flex justify-end">
                                <button
                                  onClick={() => requestFieldClarification("dealbreakers")}
                                  disabled={clarifyingField !== null}
                                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium px-4 py-1.5 transition-colors"
                                >
                                  {clarifyingField === "dealbreakers" ? "Checking..." : "Apply"}
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    )}
                    </AnimatePresence>

                    {/* Skills + Bootcamps — only after all three applied */}
                    <AnimatePresence>
                      {criteriaApplied.p0 && criteriaApplied.p1 && criteriaApplied.dealbreakers && (
                        <motion.div
                          key="skills-section"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ duration: 0.3 }}
                          className="flex flex-col gap-4"
                        >
                          <h3 className="text-sm font-medium text-neutral-900">Skills</h3>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Domain / Stack</label>
                            <TagInput
                              tags={criteria.skills}
                              onChange={tags => updateCriteria(c => ({ ...c, skills: tags }))}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-neutral-500">Bootcamps & courses</span>
                            <select
                              value={criteria.non_work_weight}
                              onChange={e => updateCriteria(c => ({ ...c, non_work_weight: e.target.value as CriteriaState["non_work_weight"] }))}
                              className="text-sm pb-1 border-b border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 cursor-pointer transition-colors"
                            >
                              <option value="ignore">Ignore</option>
                              <option value="weak_signal">Weak signal</option>
                              <option value="partial">Partial credit</option>
                              <option value="full">Full credit</option>
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>

                  {/* Bottom action row */}
                  <div className="flex items-center justify-between gap-3 pt-6 mt-2 border-t border-neutral-100">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleApplyChanges}
                        disabled={applyLoading || !criteriaApplied.p0 || !criteriaApplied.p1 || !criteriaApplied.dealbreakers}
                        className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                          criteriaApplied.p0 && criteriaApplied.p1 && criteriaApplied.dealbreakers
                            ? "bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
                            : "bg-neutral-100 text-neutral-400 border border-neutral-200"
                        }`}
                      >
                        {applyLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Building…</> : "Apply Changes"}
                      </button>
                      {applyError && <span className="text-xs text-red-500">{applyError}</span>}
                    </div>
                    <button
                      onClick={() => {
                        if (!criteria) return setStep(2);
                        const warnings = detectVagueness(criteria);
                        if (warnings.length > 0) { setVaguenessModal(warnings); return; }
                        setStep(2);
                      }}
                      disabled={!paramsData?.evaluator_prompt}
                      className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                      title={!paramsData?.evaluator_prompt ? "Click Apply Changes first" : undefined}
                    >
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* RIGHT: Raw Evaluator Prompt */}
                <div className="sticky top-8 flex flex-col gap-4">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Evaluator</h2>
                  {paramsData?.evaluator_prompt ? (
                    <div>
                      <button
                        onClick={() => setRawPromptOpen(v => !v)}
                        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors w-full text-left"
                      >
                        {rawPromptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Raw evaluator prompt
                      </button>
                      {rawPromptOpen && (
                        <textarea
                          value={paramsData.evaluator_prompt}
                          onChange={e => {
                            const updated = { ...paramsData, evaluator_prompt: e.target.value };
                            setParamsData(updated);
                            paramsDataRef.current = updated;
                          }}
                          className="mt-3 w-full text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-200 focus:border-neutral-400 outline-none p-3 font-mono leading-relaxed resize-y"
                          style={{ minHeight: 300 }}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400">Click "Apply Changes" to generate the evaluator prompt.</p>
                  )}
                </div>

              </motion.div>
            )}
          </>
        )}

        {/* Clarifying questions modal */}
        {clarifyingOpen && clarifyingQuestions && (
          <ClarifyingQuestionsModal
            questions={clarifyingQuestions}
            onSubmit={handleClarifySubmit}
            onSkip={() => {
              setClarifyingOpen(false);
              if (clarifyPendingField) {
                applyFieldLocally(clarifyPendingField);
                setClarifyPendingCriteria(null);
                setClarifyPendingField(null);
                return;
              }
              if (clarifyPendingCriteria && paramsData) {
                const pending = clarifyPendingCriteria;
                setClarifyPendingCriteria(null);
                setApplyLoading(true);
                setApplyError(null);
                doBuildEvaluator(pending);
              }
            }}
          />
        )}

        {/* ── STEP 2: Calibration ── */}
        {step === 2 && (() => {
          const inReview = tasteResults.length > 0;
          const safeIdx = Math.min(reviewIndex, tasteResults.length - 1);
          const item = inReview ? tasteResults[safeIdx] : null;
          const batchDone = inReview && reviewIndex >= tasteResults.length;
          const remaining = parsedResumes.filter(r => !evaluatedFilenames.has(r.filename)).length;

          // ── CALIBRATION COMPLETE SCREEN ────────────────────────────────────
          if (calibrationComplete) return (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center min-h-[70vh]"
            >
              <div className="flex flex-col gap-10 max-w-lg px-6">
                <div className="flex flex-col gap-4">
                  <h1 className="font-serif text-5xl text-neutral-900 leading-tight">AI calibrated<br />to your taste.</h1>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    You've agreed with the AI on 4 consecutive candidates. The evaluator prompt has been shaped to your judgment — ready to run the full pool.
                  </p>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-neutral-200 px-4 py-3 flex flex-col gap-1">
                    <span className="text-2xl font-bold text-neutral-900">{tasteResults.length + (parsedResumes.length - parsedResumes.filter(r => !evaluatedFilenames.has(r.filename)).length - tasteResults.length)}</span>
                    <span className="text-xs text-neutral-400">Reviewed</span>
                  </div>
                  <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col gap-1">
                    <span className="text-2xl font-bold text-emerald-700">4</span>
                    <span className="text-xs text-emerald-500">Consecutive agrees</span>
                  </div>
                  <div className="border border-neutral-200 px-4 py-3 flex flex-col gap-1">
                    <span className="text-2xl font-bold text-neutral-900">{parsedResumes.length}</span>
                    <span className="text-xs text-neutral-400">
                      Ready{tasteParseErrorCount > 0 ? ` (${tasteParseErrorCount} skipped)` : ""}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => parsedResumes.length > 0 ? runFullScreenFromTastePool() : setStep(3)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    {parsedResumes.length > 0 ? `Screen All ${parsedResumes.length} Resumes` : "Proceed to Full Screening"}
                  </button>
                  <button
                    onClick={() => { setCalibrationComplete(false); setConsecutiveAgrees(0); setReviewIndex(i => i + 1); }}
                    className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors text-center"
                  >
                    Continue reviewing more resumes anyway
                  </button>
                </div>
              </div>
            </motion.div>
          );

          // ── TASTE CHECK INTRO SCREEN ──────────────────────────────────────
          if (!inReview && !tasteIntroSeen) return (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center min-h-[72vh]"
            >
              <div className="flex flex-col gap-10 max-w-sm">
                <div className="flex flex-col gap-4">
                  <h1 className="font-serif text-5xl text-neutral-900 leading-tight">You set the bar.<br />We learn it.</h1>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    We'll show you a few resumes. Agree or disagree with the AI's call — it calibrates to your standard as you go.
                  </p>
                  <p className="text-xs text-amber-600 font-medium">No one gets hired or rejected here.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setTasteIntroSeen(true)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors"
                  >
                    Upload resumes <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setStep(1); setTasteIntroSeen(false); }}
                    className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors text-center"
                  >
                    ← Back to criteria
                  </button>
                </div>
              </div>
            </motion.div>
          );

          // ── UPLOAD SCREEN ──────────────────────────────────────────────────
          if (!inReview) return (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center justify-center min-h-[60vh] gap-10"
            >
              <div className="text-center">
                <h2 className="font-serif text-4xl text-neutral-900 mb-2">Upload your pool.</h2>
                <p className="text-sm text-neutral-500">The AI will evaluate a randomised sample of 5 for calibration.</p>
              </div>

              <div className="w-full max-w-lg">
                <div className="relative border border-dashed border-neutral-300 bg-white hover:bg-neutral-50 hover:border-neutral-400 transition-all flex flex-col items-center justify-center" style={{ minHeight: 220 }}>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    multiple
                    onChange={handleTasteUpload}
                    disabled={evaluatingTaste}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  {evaluatingTaste ? (
                    <div className="flex flex-col items-center gap-4 py-10 px-6 w-full">
                      <Loader2 className="w-7 h-7 text-neutral-400 animate-spin" />
                      <p className="text-sm font-medium text-neutral-700">Evaluating your resumes…</p>
                      <p className="text-xs text-neutral-400">{tastePoolCount} uploaded · picking a mixed sample</p>
                      {tasteProgress && (
                        <div className="w-full mt-1">
                          <div className="flex justify-between text-[11px] text-neutral-400 mb-1.5">
                            <span>{tasteProgress.phase}</span>
                            <span>{tasteProgress.done} / {tasteProgress.total}</span>
                          </div>
                          <div className="w-full h-px bg-neutral-200 overflow-hidden">
                            <div
                              className="h-full bg-neutral-900 transition-all duration-300"
                              style={{ width: `${tasteProgress.total ? (tasteProgress.done / tasteProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                      <UploadCloud className="w-8 h-8 text-neutral-300" />
                      <div>
                        <p className="text-sm font-medium text-neutral-700">Drop files here or click to upload</p>
                        <p className="text-xs text-neutral-400 mt-1">PDF or Word (.docx) — any quantity</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button onClick={() => { setStep(1); setTasteIntroSeen(false); }} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors">
                ← Back to criteria
              </button>
            </motion.div>
          );

          // ── BATCH TRANSITION SCREEN (auto-advances; shows while loading next batch) ──────────────────────────────────────────
          if (batchDone) return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
              {evaluatingTaste ? (
                <>
                  <Loader2 className="w-7 h-7 text-neutral-400 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-neutral-700">Loading next batch…</p>
                    {tasteProgress && (
                      <p className="text-xs text-neutral-400 mt-1">{tasteProgress.phase} — {tasteProgress.done} / {tasteProgress.total}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                  <div className="text-center">
                    <h3 className="font-serif text-3xl text-neutral-900">All resumes reviewed</h3>
                    <p className="text-sm text-neutral-500 mt-2">Ready to run full pool screening.</p>
                  </div>
                  <button
                    onClick={() => parsedResumes.length > 0 ? runFullScreenFromTastePool() : setStep(3)}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors"
                  >
                    {parsedResumes.length > 0 ? `Screen All ${parsedResumes.length} Resumes` : "Proceed to Full Screening"} <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
              {recalibrateError && <p className="text-xs text-red-600 border border-red-100 px-4 py-2">{recalibrateError}</p>}
            </div>
          );

          // ── ACTIVE REVIEW SCREEN ────────────────────────────────────────────
          const rating = item!.result?.rating_result.rating;
          const fb = feedback[item!.filename];
          const rr = rejectReasons[item!.filename];

          const verdictConfig: Record<string, { bg: string; border: string; label: string; icon: string; textColor: string }> = {
            P0: { bg: "bg-emerald-50", border: "border-emerald-200", label: "Strong Hire", icon: "✦", textColor: "text-emerald-700" },
            P1: { bg: "bg-amber-50", border: "border-amber-200", label: "Possible Hire", icon: "◈", textColor: "text-amber-700" },
            Reject: { bg: "bg-red-50", border: "border-red-200", label: "Not a Fit", icon: "✕", textColor: "text-red-700" },
          };
          const vc = verdictConfig[rating ?? ""] ?? { bg: "bg-slate-50", border: "border-slate-200", label: "Evaluating…", icon: "·", textColor: "text-slate-500" };

          return (
            <>
            <div className="flex flex-col gap-0" style={{ height: "calc(100vh - 120px)", minHeight: 700 }}>
              {/* Top bar */}
              <div className="flex items-center justify-between bg-white border-b border-neutral-200 px-5 py-3">
                <div className="flex items-center gap-4">
                  <button onClick={() => { setStep(1); setTasteIntroSeen(false); }} className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors">← Criteria</button>
                  <div className="w-px h-4 bg-neutral-200" />
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Taste Check</span>
                </div>
                <div className="flex items-center gap-3 flex-1 mx-8">
                  <div className="flex-1 h-px bg-neutral-200 overflow-hidden">
                    <div
                      className="h-full bg-neutral-900 transition-all duration-500"
                      style={{ width: `${(Math.min(reviewIndex, tasteResults.length) / tasteResults.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-neutral-400 flex-shrink-0 tabular-nums">
                    {Math.min(reviewIndex + 1, tasteResults.length)} / {tasteResults.length}
                  </span>
                </div>
                <button
                  onClick={() => setEvalPromptDrawerOpen(v => !v)}
                  title="View evaluator prompt"
                  className={`p-1.5 rounded transition-colors ${evalPromptDrawerOpen ? "bg-neutral-100 text-neutral-700" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => parsedResumes.length > 0 ? runFullScreenFromTastePool() : setStep(3)}
                  className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition-colors"
                >
                  {parsedResumes.length > 0 ? `Go to Full Pool →` : "Full Screen →"}
                </button>
              </div>

              {/* Main split */}
              <div className="flex flex-1 overflow-hidden bg-white border-b border-neutral-200" style={{ minHeight: 0 }}>

                {/* LEFT: PDF viewer */}
                <div className="flex flex-col border-r border-neutral-200" style={{ flex: "0 0 58%" }}>
                  {/* Candidate name bar */}
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-neutral-100 bg-neutral-50">
                    <div className="w-7 h-7 bg-neutral-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-neutral-600">{(item!.name ?? "?")[0]?.toUpperCase()}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-800 truncate flex-1" title={item!.name}>{item!.name}</h3>
                    <div className="flex items-center gap-1.5">
                      {(item!.result?.signal_json as any)?.college_name && (
                        <span className="text-[10px] font-medium px-2 py-0.5 border border-neutral-200 text-neutral-600 whitespace-nowrap">
                          {(item!.result?.signal_json as any).college_name}
                          {(item!.result?.signal_json as any).college_tier === "tier_1" && " ★"}
                        </span>
                      )}
                      {((item!.result?.signal_json as any)?.tier_1_companies?.length ?? 0) > 0 && (
                        <span className="text-[10px] font-medium px-2 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700 whitespace-nowrap">
                          {(item!.result?.signal_json as any).tier_1_companies[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* PDF */}
                  <PdfViewer url={pdfUrl} className="flex-1" style={{ height: 0, flexGrow: 1 }} />
                </div>

                {/* RIGHT: Verdict + actions */}
                <div className="flex flex-col overflow-y-auto" style={{ flex: "0 0 42%" }}>

                  {/* Loading */}
                  {!item!.result && !item!.error && (
                    <div className="flex flex-col items-center justify-center gap-3 flex-1 p-10">
                      <MiniScanner />
                      <p className="text-xs text-neutral-400">Evaluating resume…</p>
                    </div>
                  )}

                  {/* Error */}
                  {item!.error && (
                    <div className="flex flex-col gap-3 p-6">
                      <div className="bg-red-50 border border-red-100 p-4">
                        <p className="text-xs font-semibold text-red-700 mb-1">Evaluation failed</p>
                        <p className="text-xs text-red-500">{item!.error}</p>
                      </div>
                      <button onClick={() => setReviewIndex(i => i + 1)} className="self-start px-4 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors">Skip →</button>
                    </div>
                  )}

                  {/* Result */}
                  {item!.result && (
                    <div className="flex flex-col flex-1">

                      {/* AI VERDICT */}
                      <div className="px-6 pt-6 pb-4">
                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-3">AI Verdict</p>
                        <div className={`border ${vc.bg} ${vc.border} px-5 py-4 flex items-center gap-4`}>
                          <span className={`text-2xl font-black ${vc.textColor}`}>{vc.icon}</span>
                          <div>
                            <p className={`text-xl font-black ${vc.textColor}`}>{rating}</p>
                            <p className={`text-xs font-medium ${vc.textColor} opacity-70`}>{vc.label}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mx-6 h-px bg-neutral-100" />

                      {/* ANALYSIS + FLAGS combined */}
                      <div className="px-6 py-4 flex flex-col gap-2">
                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-1">Analysis</p>
                        {item!.result.rating_result.reject_reason && !isExpText(item!.result.rating_result.reject_reason) && (
                          <div className="flex gap-2 items-start text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 leading-relaxed">
                            <span className="flex-shrink-0 font-bold text-red-400 mt-px">✕</span>
                            <span className="font-semibold">{item!.result.rating_result.reject_reason}</span>
                          </div>
                        )}
                        {item!.result.rating_result.reasoning.filter((r: string) => !isExpText(r)).map((r, i) => (
                          <div key={i} className="text-xs text-neutral-600 flex gap-2 leading-relaxed">
                            <span className="text-neutral-300 flex-shrink-0 mt-0.5 font-bold">—</span>
                            <span>{r}</span>
                          </div>
                        ))}
                        {item!.result.rating_result.concerns.filter((c: string) => !isExpText(c)).map((c, i) => (
                          <div key={`c${i}`} className="flex gap-2 items-start text-xs text-amber-800 bg-amber-50 border border-amber-100 px-3 py-2 leading-relaxed">
                            <span className="flex-shrink-0 font-bold text-amber-400 mt-px">!</span>
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex-1" />
                      <div className="mx-6 h-px bg-slate-100" />

                      {/* CALIBRATION ACTION */}
                      <div className="px-6 py-5 flex flex-col gap-3">
                        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">Your call</p>

                        {/* Pending decision */}
                        {!fb && !disagreeStage[item!.filename] && (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => {
                                const newConsec = consecutiveAgrees + 1;
                                setConsecutiveAgrees(newConsec);
                                handleFeedback(item!.filename, "agree");
                                if (newConsec >= 4) {
                                  setCalibrationComplete(true);
                                } else {
                                  setReviewIndex(i => i + 1);
                                }
                              }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors"
                            >
                              <Check className="w-4 h-4" /> Agree with AI
                            </button>
                            <button
                              onClick={() => {
                                setConsecutiveAgrees(0);
                                setDisagreeStage(prev => ({ ...prev, [item!.filename]: {} }));
                              }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-neutral-200 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors"
                            >
                              <AlertCircle className="w-4 h-4 text-amber-500" /> Disagree &amp; Recalibrate
                            </button>
                          </div>
                        )}

                        {/* Agreed */}
                        {fb === "agree" && (
                          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-3">
                            <Check className="w-4 h-4" /> Agreed · moving to next
                          </div>
                        )}

                        {/* Disagreeing — Step 1: choose direction */}
                        {disagreeStage[item!.filename] && !disagreeStage[item!.filename].direction && (() => {
                          const ratingLabel = { P0: "P0 (Strong Hire)", P1: "P1 (Interview)", Reject: "Reject" }[rating as string] ?? rating;
                          return (
                            <div className="flex flex-col gap-3 bg-neutral-50 border border-neutral-200 p-4">
                              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">AI said {ratingLabel} — where did it go wrong?</p>
                              <div className="flex flex-col gap-2">
                                {rating !== "P0" && (
                                  <button
                                    onClick={() => {
                                      setDisagreeStage(prev => ({ ...prev, [item!.filename]: { direction: "higher" } }));
                                      setFeedback(prev => ({ ...prev, [item!.filename]: "disagree_too_low" }));
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                  >
                                    ↑ Rated too low — AI was too harsh
                                  </button>
                                )}
                                {rating !== "Reject" && (
                                  <button
                                    onClick={() => {
                                      setDisagreeStage(prev => ({ ...prev, [item!.filename]: { direction: "lower" } }));
                                      setFeedback(prev => ({ ...prev, [item!.filename]: "disagree_too_high" }));
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                                  >
                                    ↓ Rated too high — AI was too generous
                                  </button>
                                )}
                              </div>
                              <button
                                onClick={() => setDisagreeStage(prev => { const n = { ...prev }; delete n[item!.filename]; return n; })}
                                className="text-[11px] text-neutral-400 hover:text-neutral-600 text-center"
                              >
                                Cancel
                              </button>
                            </div>
                          );
                        })()}

                        {/* Disagreeing — Step 2: choose specific target */}
                        {disagreeStage[item!.filename]?.direction && !disagreeStage[item!.filename]?.target && (() => {
                          const ds = disagreeStage[item!.filename];
                          const ratingLabel = { P0: "P0", P1: "P1", Reject: "Reject" }[rating as string] ?? rating;

                          type TargetOpt = { key: "P0" | "P1" | "Reject" | "Baseline"; label: string; sub: string; color: string };
                          const options: TargetOpt[] = [];
                          if (ds.direction === "higher") {
                            if (rating === "P1" || rating === "Reject") options.push({ key: "P0", label: "P0 — Strong Hire", sub: "Clearly meets the bar", color: "emerald" });
                            if (rating === "Reject") options.push({ key: "P1", label: "P1 — Interview", sub: "Worth exploring further", color: "amber" });
                            options.push({ key: "Baseline", label: "Change Non-Negotiables", sub: "The baseline criteria itself is too strict", color: "sky" });
                          } else {
                            if (rating === "P0") { options.push({ key: "P1", label: "P1 — Interview", sub: "Good but not exceptional", color: "amber" }); }
                            options.push({ key: "Reject", label: "Reject", sub: "Doesn't clear the bar", color: "red" });
                            options.push({ key: "Baseline", label: "Change Non-Negotiables", sub: "The baseline criteria itself is too lenient", color: "sky" });
                          }

                          return (
                            <div className="flex flex-col gap-3 bg-neutral-50 border border-neutral-200 p-4">
                              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">
                                AI said <span className="text-neutral-700">{ratingLabel}</span> — correct outcome:
                              </p>
                              <div className="flex flex-col gap-2">
                                {options.map(opt => {
                                  const colorMap: Record<string, string> = {
                                    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                                    amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                                    red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                                    sky: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
                                  };
                                  return (
                                    <button
                                      key={opt.key}
                                      onClick={() => setDisagreeStage(prev => ({ ...prev, [item!.filename]: { ...prev[item!.filename], target: opt.key } }))}
                                      className={`w-full flex flex-col items-start px-4 py-2.5 border text-left transition-colors ${colorMap[opt.color]}`}
                                    >
                                      <span className="text-sm font-medium">{opt.label}</span>
                                      <span className="text-[11px] opacity-70">{opt.sub}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() => setDisagreeStage(prev => ({ ...prev, [item!.filename]: {} }))}
                                className="text-[11px] text-neutral-400 hover:text-neutral-600 text-center"
                              >
                                ← Back
                              </button>
                            </div>
                          );
                        })()}

                        {/* Disagreeing — Step 3: describe the issue + recalibrate */}
                        {disagreeStage[item!.filename]?.target && (() => {
                          const ds = disagreeStage[item!.filename];
                          const targetLabels: Record<string, string> = { P0: "P0 — Strong Hire", P1: "P1 — Interview", Reject: "Reject", Baseline: "Baseline Criteria" };
                          return (
                            <div className="flex flex-col gap-3 bg-neutral-50 border border-neutral-200 p-4">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">
                                  Correcting to: <span className="text-neutral-700">{targetLabels[ds.target!]}</span>
                                </p>
                                <button
                                  onClick={() => setDisagreeStage(prev => ({ ...prev, [item!.filename]: { direction: ds.direction } }))}
                                  className="text-[11px] text-neutral-400 hover:text-neutral-600"
                                >
                                  ← Back
                                </button>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Specific issue?</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {REJECT_CATEGORIES.map(cat => {
                                    const selected = (rr?.category ?? []).includes(cat.id);
                                    return (
                                      <button
                                        key={cat.id}
                                        onClick={() => setRejectReasons(prev => {
                                          const current = prev[item!.filename]?.category ?? [];
                                          const next = selected ? current.filter(id => id !== cat.id) : [...current, cat.id];
                                          return { ...prev, [item!.filename]: { category: next, description: prev[item!.filename]?.description ?? "" } };
                                        })}
                                        className={`px-2.5 py-1 text-[11px] font-medium border transition-colors ${selected ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}
                                      >
                                        {cat.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <textarea
                                  value={rr?.description ?? ""}
                                  onChange={e => setRejectReasons(prev => ({ ...prev, [item!.filename]: { category: prev[item!.filename]?.category ?? [], description: e.target.value } }))}
                                  placeholder={ds.target === "Baseline" ? "What's wrong with the non-negotiables?" : `What would you expect a ${ds.target} candidate to show?`}
                                  rows={2}
                                  className="w-full text-xs border-b border-neutral-200 bg-transparent outline-none px-0 py-2 mt-1 resize-none placeholder-neutral-400 focus:border-emerald-700 transition-colors"
                                />
                              </div>

                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={async () => {
                                    setInlineRecalibrating(true);
                                    setConsecutiveAgrees(0);
                                    try { await handleRecalibrate(); }
                                    finally { setInlineRecalibrating(false); setReviewIndex(i => i + 1); }
                                  }}
                                  disabled={inlineRecalibrating}
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                                >
                                  {inlineRecalibrating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Recalibrating…</> : "Recalibrate & Next →"}
                                </button>
                                <button
                                  onClick={() => setReviewIndex(i => i + 1)}
                                  disabled={inlineRecalibrating}
                                  className="px-4 py-2.5 text-xs font-medium text-neutral-500 border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                                >
                                  Skip
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Evaluator Prompt Drawer */}
            <AnimatePresence>
              {evalPromptDrawerOpen && (
                <>
                  <motion.div
                    key="ep-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setEvalPromptDrawerOpen(false)}
                    className="fixed inset-0 bg-black/20 z-40"
                  />
                  <motion.div
                    key="ep-drawer"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 280 }}
                    className="fixed right-0 top-0 h-full w-[480px] bg-white border-l border-neutral-200 shadow-2xl z-50 flex flex-col"
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Evaluator Prompt</p>
                        <p className="text-xs text-neutral-400 mt-0.5">Live prompt — updates after each recalibration</p>
                      </div>
                      <button
                        onClick={() => setEvalPromptDrawerOpen(false)}
                        className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5">
                      <pre className="text-[11px] text-neutral-600 font-mono whitespace-pre-wrap leading-relaxed select-all">
                        {paramsData?.evaluator_prompt ?? "No evaluator prompt yet."}
                      </pre>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            </>
          );
        })()}

        {/* ── STEP 3: Full Screening ── */}
        {step === 3 && (
          <div className="flex flex-col gap-6 pb-16">
            {/* Header */}
            <div className="flex justify-between items-end">
              <div>
                <h1 className="font-serif text-4xl text-neutral-900 mb-1">
                  {screening ? `Screening ${bulkProgress?.total ?? "…"} resumes` : bulkResults.length > 0 ? `${bulkResults.length} candidates screened` : "Screen the pool"}
                </h1>
                <p className="text-sm text-neutral-500">
                  {screening ? "Results appear below as each resume is processed." : bulkResults.length > 0 ? "Drop more resumes above to add them to this pool." : "Upload all resumes for the final decision table."}
                </p>
              </div>
              <div className="flex items-center gap-3 mb-1">
                <button
                  onClick={() => setStep(2)}
                  className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  ← Back to calibration
                </button>
                {bulkResults.length > 0 && !screening && (
                  <button
                    onClick={() => setShowShortlistModal(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition-colors"
                  >
                    Send Shortlist →
                  </button>
                )}
              </div>
            </div>

            {/* Upload zone */}
            <div className="relative border border-dashed border-neutral-300 bg-white hover:bg-neutral-50 transition-colors flex flex-col items-center justify-center min-h-[100px]">
              {!screening && (
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  multiple
                  onChange={handleBulkUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              )}
              <div className="flex flex-col items-center gap-3 py-6 px-4 w-full max-w-sm">
                {screening && bulkProgress ? (
                  <>
                    <p className="text-sm font-medium text-neutral-700">
                      {bulkProgress.phase === "Parsing PDFs" ? "Parsing PDFs…" : "Screening candidates…"}
                    </p>
                    <div className="w-full">
                      <div className="flex justify-between text-xs text-neutral-400 mb-2">
                        <span>{bulkProgress.done} / {bulkProgress.total}</span>
                        <span>{Math.round((bulkProgress.done / bulkProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full h-px bg-neutral-200 overflow-hidden">
                        <div
                          className="h-full bg-neutral-900 transition-all duration-300"
                          style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-neutral-400">Results appear below as each resume is processed</p>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <UploadCloud className="w-5 h-5 text-neutral-300" />
                    <p className="text-sm text-neutral-500">
                      {bulkResults.length > 0 ? "Add more resumes · PDF or Word" : "Upload resumes · PDF or Word"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {!screening && parsedResumes.length > 0 && bulkResults.length === 0 && (
              <div className="border border-neutral-200 bg-neutral-50 p-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-neutral-800">Taste-checked pool is ready</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    {parsedResumes.length} resumes from calibration · screened on the accepted prompt.
                  </p>
                </div>
                <button
                  onClick={runFullScreenFromTastePool}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors"
                >
                  Screen All {parsedResumes.length} Resumes
                </button>
              </div>
            )}

            {bulkParseErrorCount > 0 && !screening && (
              <div className="bg-amber-50 border border-amber-200 px-4 py-4 flex gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-amber-800">
                    <span className="font-semibold">{bulkParseErrorCount} resume{bulkParseErrorCount !== 1 ? "s" : ""} could not be read and were skipped.</span>
                    {bulkUploadTotal > 0 && <span className="text-amber-700"> {bulkUploadTotal - bulkParseErrorCount} of {bulkUploadTotal} files screened.</span>}
                  </span>
                  {bulkParseFailedNames.length > 0 && (
                    <ul className="flex flex-col gap-0.5">
                      {bulkParseFailedNames.map(name => (
                        <li key={name} className="text-xs text-amber-700 font-mono">• {name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}


            {paramsData?.scorer_prompt && (
              <div className="border border-neutral-200 overflow-hidden mb-3">
                <button
                  onClick={() => setScorerOpen(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors bg-white"
                >
                  <span className="font-medium">Scoring criteria ({paramsData.scoring_params?.length ?? 0} parameters)</span>
                  {scorerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {scorerOpen && (
                  <div className="px-5 pb-4 pt-1 bg-neutral-50 border-t border-neutral-100">
                    {(paramsData.scoring_params ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(paramsData.scoring_params ?? []).map((p: any) => (
                          <span key={p.id} className="text-[11px] bg-white border border-neutral-200 px-2 py-0.5 rounded text-neutral-600">
                            <span className="font-medium">{p.name}</span> <span className="text-neutral-400">×{p.weight}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <details>
                      <summary className="text-[11px] text-neutral-400 cursor-pointer hover:text-neutral-600 select-none">View scorer prompt</summary>
                      <pre className="mt-2 text-[10px] text-neutral-600 bg-white border border-neutral-200 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{paramsData.scorer_prompt}</pre>
                    </details>
                  </div>
                )}
              </div>
            )}

            {bulkResults.length > 0 && (() => {
              const hasRanks = bulkResults.some(r => r.rank != null);
              const showRankColumn = hasRanks || ranking;
              const shortlistCount = bulkResults.filter(r => r.rating === "P0" || r.rating === "P1").length;
              return (
              <div className="border border-neutral-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                      {bulkResults.length} candidate{bulkResults.length !== 1 ? "s" : ""}
                      {screening && bulkProgress ? ` — ${bulkProgress.total - bulkResults.length} remaining` : ""}
                      {!screening && bulkParseErrorCount > 0 ? ` · ${bulkParseErrorCount} skipped` : ""}
                    </span>
                    {ranking && rankingProgress && (
                      <span className="text-xs text-sky-600 animate-pulse">
                        Ranking {rankingProgress.done}/{rankingProgress.total}…
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {!screening && !ranking && !hasRanks && shortlistCount > 0 && paramsData?.scorer_prompt && (
                      <button
                        onClick={() => runRanking(bulkResults)}
                        className="flex items-center gap-1.5 text-xs font-medium text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded transition-colors"
                      >
                        Rank {shortlistCount} shortlisted
                      </button>
                    )}
                    <button
                      onClick={exportCsv}
                      className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                  </div>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-white">
                    <tr>
                      {showRankColumn && <th className="px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-widest w-16">Rank</th>}
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Candidate</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Decision</th>
                      <th className="px-6 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-widest">Reason</th>
                      <th className="px-4 py-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {[...bulkResults].sort((a, b) => {
                      if (hasRanks) {
                        if (a.rank != null && b.rank != null) return a.rank - b.rank;
                        if (a.rank != null) return -1;
                        if (b.rank != null) return 1;
                      }
                      const order: Record<string, number> = { "P0": 0, "P1": 1, "Reject": 2, "Error": 3 };
                      return (order[effectiveRating(a)] ?? 4) - (order[effectiveRating(b)] ?? 4);
                    }).map((res, i) => (
                      <tr key={i} className="hover:bg-neutral-50">
                        {showRankColumn && (
                          <td className="px-3 py-4 text-center">
                            {res.rank != null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-sm font-bold text-neutral-700">#{res.rank}</span>
                                {res.composite_score != null && (
                                  <span className="text-[10px] text-neutral-400">{res.composite_score}</span>
                                )}
                              </div>
                            ) : (ranking && (res.rating === "P0" || res.rating === "P1")) ? (
                              <span className="text-xs text-neutral-300 animate-pulse">…</span>
                            ) : null}
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="font-medium text-neutral-900">{res.name}</div>
                          {(res.email || res.phone) && (
                            <div className="text-xs text-neutral-400 mt-0.5">
                              {[res.email, res.phone].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {res.college_name && (
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              {res.college_name}{res.college_tier === "tier_1" ? " ★" : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {res.rating && res.rating !== "Error" ? (
                            <div className="flex flex-col gap-1">
                              <select
                                value={effectiveRating(res)}
                                onChange={e => setManualRatingOverrides(prev => ({ ...prev, [res.filename]: e.target.value as "P0" | "P1" | "Reject" }))}
                                disabled={screening}
                                className={`text-xs font-medium px-2 py-1 border cursor-pointer focus:outline-none ${
                                  effectiveRating(res) === "P0" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  effectiveRating(res) === "P1" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  "bg-red-50 text-red-700 border-red-200"
                                }`}
                              >
                                <option value="P0">P0 — Strong Hire</option>
                                <option value="P1">P1 — Interview</option>
                                <option value="Reject">Reject</option>
                              </select>
                              {manualRatingOverrides[res.filename] && manualRatingOverrides[res.filename] !== res.rating && (
                                <span className="text-[10px] text-neutral-400">AI: {res.rating}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-red-500 font-medium">Error</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-neutral-600 max-w-md">
                          <span className="text-sm line-clamp-2" title={res.reject_reason ?? (res.reasoning ?? []).join("; ")}>
                            {(() => { const t = res.reject_reason ?? (res.reasoning ?? []).find((r: string) => !isExpText(r)) ?? "—"; return isExpText(t) ? "—" : t; })()}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => openResumeModal(res.filename, res)}
                            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 px-2.5 py-1.5 transition-colors whitespace-nowrap"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              );
            })()}


            {/* ── Send Shortlist Modal ── */}
            {showShortlistModal && (
              <SendShortlistModal
                candidates={bulkResults.map(r => {
                  const sig = (r.signal_json as any) ?? {};
                  const latestWork = Array.isArray(sig.work_history) && sig.work_history.length > 0 ? sig.work_history[0] : null;
                  return {
                    filename: r.filename,
                    name: r.name ?? r.filename,
                    email: r.email ?? null,
                    aiRating: (manualRatingOverrides[r.filename] ?? r.rating) as string,
                    reason: r.reject_reason ?? null,
                    reasoning: r.reasoning ?? [],
                    currentRole: latestWork?.role ?? null,
                    currentCompany: latestWork?.company ?? null,
                  };
                })}
                onConfirm={handleShortlistConfirm}
                onCancel={() => setShowShortlistModal(false)}
              />
            )}

            {/* ── Resume viewer modal ── */}
            {resumeModal && (
              <ResumeModalOverlay url={resumeModal.url} result={resumeModal.result} onClose={closeResumeModal} />
            )}
          </div>
        )}

      {/* ── High pass-rate dialog ── */}
      {highPassDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <p className="text-lg font-bold text-neutral-900 leading-snug">
                {highPassDialog.pct}% passed — that's not a shortlist, that's everyone.
              </p>
              <p className="text-sm text-neutral-500 mt-2">
                {highPassDialog.passed} of {highPassDialog.screened} screened candidates cleared P0/P1. Your criteria may be too lenient to filter effectively.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => { setHighPassDialog(null); setStep(1); }}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Change Criteria
              </button>
              <button
                onClick={() => setHighPassDialog(null)}
                className="flex-1 px-4 py-2.5 bg-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-300 transition-colors"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vagueness warning modal — top-level so it shows from any step ── */}
      {vaguenessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Your criteria are too vague to shortlist effectively</p>
                <p className="text-xs text-amber-700 mt-0.5">These will pass most resumes. Define a real bar or you'll end up reviewing everyone.</p>
              </div>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3 max-h-80 overflow-y-auto">
              {vaguenessModal.map((w, i) => (
                <div key={i} className="flex flex-col gap-1 border border-neutral-200 px-4 py-3">
                  <p className="text-sm font-medium text-neutral-800">{w.issue}</p>
                  <p className="text-xs text-neutral-500">{w.hint}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex gap-3">
              <button
                onClick={() => setVaguenessModal(null)}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                Fix Criteria
              </button>
              <button
                onClick={() => { setVaguenessModal(null); setStep(2); }}
                className="px-4 py-2.5 text-sm font-medium text-neutral-500 border border-neutral-200 hover:bg-neutral-50 transition-colors"
              >
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
      </div>
    </div>
  );
}
