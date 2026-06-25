import React, { useState, useMemo } from "react";
import { Plus, Briefcase, Award, Trash2, Search, ChevronDown, Share2 } from "lucide-react";
import type { GeneratePromptResponse } from "./types";

export interface ATSCandidate {
  filename: string;
  name: string;
  email: string | null;
  phone: string | null;
  aiRating: string;
  finalRating: string;
  status: "new" | "shortlisted" | "rejected" | "saved";
  reason: string | null;
  reasoning: string[];
  concerns: string[];
  collegeName?: string | null;
  collegeTier?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  yearsExperience?: number | null;
  internshipMonths?: number | null;
  fulltimeMonths?: number | null;
  runAt: string;
  rank?: number | null;
  composite_score?: number | null;
}

export interface ATSRole {
  id: string;
  title: string;
  department?: string;
  createdAt: string;
  status: "active" | "draft";
  candidates: ATSCandidate[];
  params?: GeneratePromptResponse; // persisted screening params (evaluator/compressor prompt)
  tasteCalibrated?: boolean;       // true once taste calibration has been completed for this role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenerState?: Record<string, any>; // persisted UI state (jd, criteria, compressedView, etc.)
  shareToken?: string;             // backend share token — set once owner creates a share link
}

interface RolesListProps {
  roles: ATSRole[];
  onNewRole: () => void;
  onOpenRole: (roleId: string) => void;
  onDeleteRole: (roleId: string) => void;
  onShareRole?: (roleId: string) => Promise<string>;
  onChangeCriteria?: (roleId: string) => void;
}

type StatusFilter = "all" | "active" | "draft";

const SORT_OPTIONS = [
  { value: "date_desc", label: "Date created" },
  { value: "title_asc", label: "Role title" },
  { value: "screened_desc", label: "Most screened" },
  { value: "shortlisted_desc", label: "Most shortlisted" },
] as const;
type SortOption = typeof SORT_OPTIONS[number]["value"];

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) { const m = Math.floor(secs / 60); return `${m} minute${m !== 1 ? "s" : ""} ago`; }
  if (secs < 86400) { const h = Math.floor(secs / 3600); return `${h} hour${h !== 1 ? "s" : ""} ago`; }
  const d = Math.floor(secs / 86400);
  if (d < 7) return `${d} day${d !== 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function lastActivity(role: ATSRole): string {
  if (role.candidates.length === 0) return role.createdAt;
  const dates = role.candidates.map(c => c.runAt).filter(Boolean).sort();
  return dates[dates.length - 1] ?? role.createdAt;
}

export function RolesList({ roles, onNewRole, onOpenRole, onDeleteRole, onShareRole, onChangeCriteria }: RolesListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("date_desc");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharePopover, setSharePopover] = useState<{ roleId: string; url: string } | null>(null);

  const handleDelete = (e: React.MouseEvent, roleId: string) => {
    e.stopPropagation();
    if (window.confirm("Delete this role? This cannot be undone.")) {
      onDeleteRole(roleId);
    }
  };

  const handleShare = async (e: React.MouseEvent, role: ATSRole) => {
    e.stopPropagation();
    if (!onShareRole) return;
    // If already shared, just show the popover
    if (role.shareToken) {
      const url = `${window.location.origin}/role/${role.shareToken}`;
      setSharePopover({ roleId: role.id, url });
      return;
    }
    setSharingId(role.id);
    try {
      const url = await onShareRole(role.id);
      setSharePopover({ roleId: role.id, url });
    } finally {
      setSharingId(null);
    }
  };

  const filtered = useMemo(() => {
    let list = roles;
    if (statusFilter !== "all") list = list.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sort === "title_asc") return a.title.localeCompare(b.title);
      if (sort === "screened_desc") return b.candidates.length - a.candidates.length;
      if (sort === "shortlisted_desc") {
        const sa = a.candidates.filter(c => c.status === "shortlisted").length;
        const sb = b.candidates.filter(c => c.status === "shortlisted").length;
        return sb - sa;
      }
      // date_desc default
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [roles, statusFilter, search, sort]);

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "draft", label: "Draft" },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-neutral-900">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-neutral-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-emerald-700 flex items-center justify-center">
            <Award className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-neutral-900 tracking-tight">Screener</span>
        </div>
      </div>

      <div className="flex-1 px-8 py-8 max-w-6xl mx-auto w-full">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-3xl text-neutral-900">Roles</h1>
          <button
            onClick={onNewRole}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Role
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between mb-6">
          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-neutral-100 p-1">
            {STATUS_TABS.map(t => {
              const count = t.key === "all" ? roles.length : roles.filter(r => r.status === t.key).length;
              return (
                <button
                  key={t.key}
                  onClick={() => setStatusFilter(t.key)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === t.key
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span className={`ml-1.5 text-[10px] font-bold ${statusFilter === t.key ? "text-neutral-500" : "text-neutral-400"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by role title or team"
                className="text-sm border border-neutral-200 pl-9 pr-4 py-2 w-64 focus:outline-none focus:border-neutral-400 bg-white text-neutral-700 placeholder-neutral-400 transition-colors"
              />
            </div>

            {/* Sort */}
            <div className="relative">
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortOption)}
                className="appearance-none text-sm border border-neutral-200 px-4 py-2 pr-8 bg-white text-neutral-700 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>Sort by: {o.label}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 border border-dashed border-neutral-200">
            <div className="w-12 h-12 bg-neutral-100 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-neutral-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-700">No roles yet</p>
              <p className="text-xs text-neutral-400 mt-1">Create a role to start AI screening candidates</p>
            </div>
            <button
              onClick={onNewRole}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Role
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-16 border border-neutral-100">
            No roles match your search
          </p>
        ) : (
          <>
          <div className="border border-neutral-200 overflow-hidden">
            {/* Table head */}
            <div className="grid grid-cols-[1fr_140px_90px_90px_100px_72px_48px] px-6 py-3 border-b border-neutral-200 bg-neutral-50">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Role Title</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Department</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-right">Screened</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-right">Shortlisted</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-center">Status</span>
              <span />
              <span />
            </div>

            {/* Rows */}
            {filtered.map((role, i) => {
              const shortlisted = role.candidates.filter(c => c.status === "shortlisted").length;
              const total = role.candidates.length;
              const updated = timeAgo(lastActivity(role));
              const statusCfg = role.status === "active"
                ? { label: "Active", cls: "bg-emerald-50 text-emerald-700" }
                : { label: "Draft", cls: "bg-neutral-100 text-neutral-500" };
              const isThisSharing = sharingId === role.id;
              const hasShare = !!role.shareToken;

              return (
                <div
                  key={role.id}
                  className={`group grid grid-cols-[1fr_140px_90px_90px_100px_72px_48px] px-6 py-4 hover:bg-neutral-50 transition-colors cursor-pointer items-start ${i > 0 ? "border-t border-neutral-100" : ""}`}
                  onClick={() => onOpenRole(role.id)}
                >
                  {/* Role title */}
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-semibold text-neutral-900 leading-snug">{role.title}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">Updated {updated}</p>
                    {onChangeCriteria && total > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); onChangeCriteria(role.id); }}
                        className="mt-1 opacity-0 group-hover:opacity-100 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 border-b border-dashed border-neutral-400 hover:border-neutral-900 transition-all"
                      >
                        Change Criteria
                      </button>
                    )}
                  </div>

                  {/* Department */}
                  <p className="text-sm text-neutral-500 pt-0.5">{role.department ?? "—"}</p>

                  {/* Screened */}
                  <p className="text-sm text-neutral-700 font-medium text-right pt-0.5">{total > 0 ? total : "—"}</p>

                  {/* Shortlisted */}
                  <p className={`text-sm font-semibold text-right pt-0.5 ${shortlisted > 0 ? "text-emerald-700" : "text-neutral-400"}`}>
                    {shortlisted > 0 ? shortlisted : "—"}
                  </p>

                  {/* Status */}
                  <div className="flex justify-center pt-0.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Share */}
                  {onShareRole && (
                    <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleShare(e, role)}
                        disabled={isThisSharing}
                        title={hasShare ? "Copy share link" : "Share this role"}
                        className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 border transition-all mt-0.5 ${
                          hasShare
                            ? "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                            : "opacity-0 group-hover:opacity-100 border-neutral-200 text-neutral-400 hover:text-neutral-700"
                        } disabled:opacity-40`}
                      >
                        {isThisSharing
                          ? <span className="w-3 h-3 border border-neutral-400 border-t-transparent rounded-full animate-spin" />
                          : <Share2 className="w-3 h-3" />
                        }
                        {hasShare ? "Shared" : "Share"}
                      </button>
                    </div>
                  )}

                  {/* Delete */}
                  <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleDelete(e, role.id)}
                      className="p-1.5 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                      title="Delete role"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Share popover (copy link) */}
          {sharePopover && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSharePopover(null)}>
              <div className="bg-white shadow-2xl w-full max-w-sm flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                  <p className="text-sm font-semibold text-neutral-900">Share link</p>
                  <button onClick={() => setSharePopover(null)} className="p-1 hover:bg-neutral-100 text-neutral-400 transition-colors">
                    ✕
                  </button>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  <ShareLinkBox url={sharePopover.url} />
                  <p className="text-[11px] text-neutral-400">Anyone with this link can view, edit candidates, and screen more resumes.</p>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

function ShareLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-3 py-2.5">
      <span className="text-xs text-neutral-600 truncate flex-1 font-mono">{url}</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}
