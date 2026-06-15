import React, { useState, useMemo } from "react";
import { ArrowLeft, Plus, Users, Award, Trash2, Check, X, Bookmark, ChevronDown, Search, FileText, FlaskConical, Share2, Copy, CheckCheck, Download } from "lucide-react";
import type { ATSRole, ATSCandidate } from "./RolesList";

type TabKey = "all" | "new" | "shortlisted" | "rejected" | "saved";

interface RoleDetailProps {
  role: ATSRole;
  onBack: () => void;
  onNewShortlist: () => void;
  onAddMoreResumes?: (files: File[]) => void;
  onDelete: () => void;
  onUpdateStatus: (filename: string, status: ATSCandidate["status"]) => void;
  onBulkUpdateStatus: (filenames: string[], status: ATSCandidate["status"]) => void;
  onViewResume?: (filename: string) => void;
  onShare?: () => Promise<string>; // returns the shareable URL
}

const RATING_CLS: Record<string, string> = {
  P0: "bg-emerald-50 text-emerald-700 border-emerald-300",
  P1: "bg-blue-50 text-blue-700 border-blue-300",
  Reject: "bg-rose-50 text-rose-600 border-rose-200",
  Error: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

const STATUS_LABEL: Record<ATSCandidate["status"], string> = {
  new: "New",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  saved: "Saved",
};

const STATUS_CLS: Record<ATSCandidate["status"], string> = {
  new: "bg-neutral-100 text-neutral-600",
  shortlisted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-600",
  saved: "bg-amber-50 text-amber-600",
};

function Avatar({ name }: { name: string }) {
  const initial = name?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
      <span className="text-xs font-semibold text-neutral-600">{initial}</span>
    </div>
  );
}

export function RoleDetail({
  role,
  onBack,
  onNewShortlist,
  onAddMoreResumes,
  onDelete,
  onUpdateStatus,
  onBulkUpdateStatus,
  onViewResume,
  onShare,
}: RoleDetailProps) {
  const [tab, setTab] = useState<TabKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(role.shareToken ? `${window.location.origin}/role/${role.shareToken}` : null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const countFor = (key: TabKey) =>
    key === "all" ? role.candidates.length : role.candidates.filter(c => c.status === key).length;

  const tabCandidates = tab === "all" ? role.candidates : role.candidates.filter(c => c.status === tab);

  const RATING_ORDER: Record<string, number> = { P0: 0, P1: 1, Reject: 2, Error: 3 };

  const filtered = useMemo(() => {
    let list = tabCandidates;
    if (ratingFilter !== "all") list = list.filter(c => c.aiRating === ratingFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.currentRole ?? "").toLowerCase().includes(q) ||
        (c.currentCompany ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      (RATING_ORDER[a.aiRating] ?? 4) - (RATING_ORDER[b.aiRating] ?? 4)
    );
  }, [tabCandidates, ratingFilter, search]);

  const newCount = countFor("new");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "new", label: "New" },
    { key: "shortlisted", label: "Shortlisted" },
    { key: "rejected", label: "Rejected" },
    { key: "saved", label: "Saved for later" },
  ];

  const toggleSelect = (filename: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(filename)) n.delete(filename); else n.add(filename);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.filename)));
  };

  const handleBulk = (status: ATSCandidate["status"]) => {
    onBulkUpdateStatus([...selected], status);
    setSelected(new Set());
  };

  const handleDelete = () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    onDelete();
  };

  const exportCsv = () => {
    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Name", "Email", "Phone", "AI Rating", "Status", "Current Role", "Current Company", "Experience (yrs)", "College", "Top Reason", "Screened On"];
    const rows = filtered.map(c => [
      escape(c.name),
      escape(c.email),
      escape(c.phone),
      escape(c.aiRating),
      escape(c.status),
      escape(c.currentRole),
      escape(c.currentCompany),
      escape(c.yearsExperience != null ? String(c.yearsExperience) : ""),
      escape(c.collegeName),
      escape(c.reason ?? c.reasoning?.[0]),
      escape(new Date(c.runAt).toLocaleDateString("en-IN")),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${role.title.replace(/[^a-z0-9]/gi, "_")}_candidates.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-neutral-900">
      {/* Breadcrumb bar */}
      <div className="px-8 py-4 border-b border-neutral-200 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-6 h-6 bg-emerald-700 flex items-center justify-center">
            <Award className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Roles
        </button>
        <span className="text-neutral-200">/</span>
        <span className="text-sm font-medium text-neutral-900 truncate max-w-xs">{role.title}</span>
        {role.department && (
          <span className="text-xs text-neutral-400">· {role.department}</span>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {role.tasteCalibrated && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-violet-50 border border-violet-200 text-violet-700 rounded">
              <FlaskConical className="w-3 h-3" />
              Taste calibrated
            </span>
          )}
          <button
            onClick={handleDelete}
            onBlur={() => setDeleteConfirm(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors ${
              deleteConfirm
                ? "border-red-300 bg-red-50 text-red-600"
                : "border-neutral-200 text-neutral-400 hover:border-red-300 hover:text-red-500"
            }`}
          >
            <Trash2 className="w-3 h-3" />
            {deleteConfirm ? "Confirm delete" : "Delete role"}
          </button>

          {onShare && (
            <button
              onClick={async () => {
                setShareModalOpen(true);
                setSharing(true);
                try {
                  const url = await onShare();
                  setShareUrl(url);
                } catch {
                  // ignore
                } finally {
                  setSharing(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-200 text-neutral-600 hover:border-neutral-400 transition-colors"
            >
              <Share2 className="w-3 h-3" />
              Share
            </button>
          )}

          <button
            onClick={onNewShortlist}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 transition-colors"
          >
            New Shortlist
          </button>
        </div>
      </div>

      <div className="flex-1 px-8 py-7 max-w-6xl mx-auto w-full">

        {/* Empty state */}
        {role.candidates.length === 0 && (
          <div className="mb-8 flex flex-col items-center justify-center py-20 gap-5 border border-dashed border-neutral-200">
            <div className="w-12 h-12 bg-neutral-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-neutral-300" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-neutral-800">Run your first AI shortlist</p>
              <p className="text-sm text-neutral-400 mt-1 max-w-xs">
                Upload resumes and let the AI screen them against your criteria for this role.
              </p>
            </div>
            <button
              onClick={onNewShortlist}
              className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Start AI Shortlist
            </button>
          </div>
        )}

        {/* New candidates banner */}
        {newCount > 0 && (
          <div className="mb-6 flex items-center justify-between px-5 py-3.5 bg-emerald-50 border border-emerald-200">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {newCount} new candidate{newCount !== 1 ? "s" : ""} from your latest screening
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Review and move them to Shortlisted, Rejected, or Save for later.
              </p>
            </div>
            <button
              onClick={() => setTab("new")}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline underline-offset-2 shrink-0 ml-4"
            >
              View new →
            </button>
          </div>
        )}

        {role.candidates.length > 0 && (
          <>
            {/* Tabs */}
            <div className="flex gap-0 border-b border-neutral-200 mb-0">
              {tabs.map(t => {
                const count = countFor(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setSelected(new Set()); setSearch(""); setRatingFilter("all"); }}
                    className={`pb-3 px-1 mr-6 text-sm transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                      tab === t.key
                        ? "border-neutral-900 text-neutral-900 font-medium"
                        : "border-transparent text-neutral-400 hover:text-neutral-700"
                    }`}
                  >
                    {t.label}
                    {count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          tab === t.key
                            ? "bg-neutral-900 text-white"
                            : t.key === "new"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 py-3.5 border-b border-neutral-100">
              {/* Rating filter */}
              <div className="relative">
                <select
                  value={ratingFilter}
                  onChange={e => setRatingFilter(e.target.value)}
                  className="appearance-none text-xs font-medium border border-neutral-200 px-3 py-1.5 pr-7 bg-white text-neutral-700 cursor-pointer focus:outline-none focus:border-neutral-400 transition-colors"
                >
                  <option value="all">Rating: All</option>
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="Reject">Reject</option>
                </select>
                <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Search */}
              <div className="relative ml-auto">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name or email"
                  className="text-xs border border-neutral-200 pl-8 pr-3 py-1.5 w-52 focus:outline-none focus:border-neutral-400 bg-white text-neutral-700 placeholder-neutral-400 transition-colors"
                />
              </div>

              {/* Export CSV */}
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 px-3 py-1.5 transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            {/* Bulk actions bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 px-5 py-2.5 bg-neutral-900 text-white">
                <span className="text-xs font-medium">{selected.size} selected</span>
                <div className="w-px h-4 bg-neutral-700" />
                <button
                  onClick={() => handleBulk("shortlisted")}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-100 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Move to Shortlisted
                </button>
                <button
                  onClick={() => handleBulk("rejected")}
                  className="flex items-center gap-1.5 text-xs font-medium text-rose-300 hover:text-rose-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject
                </button>
                <button
                  onClick={() => handleBulk("saved")}
                  className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-100 transition-colors"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Save for later
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Table */}
            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-16 border border-neutral-100 border-t-0">
                No candidates match your filters
              </p>
            ) : (
              <div className="border border-neutral-200 border-t-0 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[32px_1fr_72px_96px_1fr_80px_100px_72px_56px] px-5 py-2.5 border-b border-neutral-200 bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className="mt-0.5 cursor-pointer"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Candidate</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-center">Rating</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-center">Status</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Top Reason</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-center">Exp.</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">College</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-right">Screened</span>
                  <span />
                </div>

                {/* Rows */}
                <div className="divide-y divide-neutral-100">
                  {filtered.map((c, i) => {
                    const isSelected = selected.has(c.filename);
                    const ratingCls = RATING_CLS[c.aiRating] ?? RATING_CLS.Error;
                    const date = new Date(c.runAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                    const roleAtCompany = [c.currentRole, c.currentCompany].filter(Boolean).join(" at ");
                    const expLabel = c.yearsExperience != null
                      ? c.yearsExperience < 1
                        ? `${Math.round(c.yearsExperience * 12)}mo`
                        : `${c.yearsExperience} yrs`
                      : "—";

                    return (
                      <div
                        key={i}
                        className={`group grid grid-cols-[32px_1fr_72px_96px_1fr_80px_100px_72px_56px] px-5 py-3.5 items-center transition-colors ${isSelected ? "bg-neutral-50" : "hover:bg-neutral-50/60"}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(c.filename)}
                          className="mt-0.5 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        />

                        {/* Candidate */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={c.name} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">{c.name}</p>
                            {roleAtCompany && (
                              <p className="text-xs text-neutral-400 truncate">{roleAtCompany}</p>
                            )}
                            <p className="text-xs text-neutral-400 truncate">
                              {[c.email, c.phone].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>

                        {/* AI Rating */}
                        <div className="flex justify-center">
                          <span className={`text-[10px] font-bold px-2 py-1 border rounded-sm ${ratingCls}`}>
                            {c.aiRating}
                          </span>
                        </div>

                        {/* Status dropdown */}
                        <div className="flex justify-center">
                          <StatusDropdown
                            value={c.status}
                            onChange={s => onUpdateStatus(c.filename, s)}
                          />
                        </div>

                        {/* Top reason */}
                        <p className="text-xs text-neutral-500 truncate pr-3">
                          {c.reason ?? c.reasoning?.[0] ?? "—"}
                        </p>

                        {/* Exp */}
                        <p className="text-xs text-neutral-600 font-medium text-center">{expLabel}</p>

                        {/* College */}
                        <p className="text-xs text-neutral-500 truncate">
                          {c.collegeName
                            ? `${c.collegeName}${c.collegeTier === "tier_1" ? " ★" : ""}`
                            : "—"}
                        </p>

                        {/* Date */}
                        <p className="text-xs text-neutral-400 text-right">{date}</p>

                        {/* View resume */}
                        {onViewResume && (
                          <div className="flex justify-end">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onViewResume(c.filename);
                              }}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 px-2 py-1 transition-all whitespace-nowrap"
                            >
                              <FileText className="w-3 h-3" />
                              View
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upload more resumes — shown in the New tab */}
            {tab === "new" && onAddMoreResumes && (
              <label className="mt-4 w-full border border-dashed border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-3 py-7 cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      onAddMoreResumes(Array.from(e.target.files));
                      e.target.value = "";
                    }
                  }}
                />
                <Plus className="w-4 h-4 text-neutral-400" />
                <span className="text-sm text-neutral-500">Upload more resumes to screen</span>
              </label>
            )}
          </>
        )}
      </div>

      {/* Share modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Share this role</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Anyone with this link can view, edit, and screen resumes.</p>
              </div>
              <button onClick={() => setShareModalOpen(false)} className="p-1.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5">
              {sharing ? (
                <div className="flex items-center gap-3 text-sm text-neutral-500">
                  <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin" />
                  Creating share link…
                </div>
              ) : shareUrl ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-3 py-2.5">
                    <span className="text-xs text-neutral-600 truncate flex-1 font-mono">{shareUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        });
                      }}
                      className="flex items-center gap-1.5 text-xs font-medium shrink-0 text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                      {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-400">This link gives full access — the recipient can view all candidates, update statuses, screen more resumes, and view PDFs.</p>
                </div>
              ) : (
                <p className="text-sm text-red-500">Failed to create share link. Please try again.</p>
              )}
            </div>

            <div className="px-6 pb-5 flex justify-end">
              <button
                onClick={() => setShareModalOpen(false)}
                className="px-4 py-2 text-sm text-neutral-600 border border-neutral-200 hover:bg-neutral-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDropdown({
  value,
  onChange,
}: {
  value: ATSCandidate["status"];
  onChange: (s: ATSCandidate["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts: ATSCandidate["status"][] = ["new", "shortlisted", "rejected", "saved"];
  const cfg = STATUS_CLS[value];

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-sm ${cfg}`}
      >
        {STATUS_LABEL[value]}
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 shadow-lg z-20 min-w-[120px]">
          {opts.map(o => (
            <button
              key={o}
              onClick={e => { e.stopPropagation(); onChange(o); setOpen(false); }}
              className={`w-full text-left text-xs px-3 py-2 hover:bg-neutral-50 transition-colors ${
                o === value ? "font-semibold text-neutral-900" : "text-neutral-600"
              }`}
            >
              {STATUS_LABEL[o]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
