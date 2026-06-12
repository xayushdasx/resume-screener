import React, { useState } from "react";
import { X, Bookmark } from "lucide-react";

export interface ShortlistEntry {
  filename: string;
  tier: "P0" | "P1";
}

interface ModalCandidate {
  filename: string;
  name: string;
  email: string | null;
  aiRating: string;
  reason: string | null;
  reasoning: string[];
  currentRole?: string | null;
  currentCompany?: string | null;
}

interface SendShortlistModalProps {
  candidates: ModalCandidate[];
  onConfirm: (shortlisted: ShortlistEntry[], rejected: string[], saved: string[]) => void;
  onCancel: () => void;
}

export function SendShortlistModal({ candidates, onConfirm, onCancel }: SendShortlistModalProps) {
  const initialShortlisted = candidates.filter(c => c.aiRating === "P0" || c.aiRating === "P1");
  const initialNotShortlisted = candidates.filter(c => c.aiRating !== "P0" && c.aiRating !== "P1");

  // Tier map: per shortlisted candidate, user can toggle P0 ↔ P1
  const [tierMap, setTierMap] = useState<Record<string, "P0" | "P1">>(() =>
    Object.fromEntries(initialShortlisted.map(c => [c.filename, c.aiRating as "P0" | "P1"]))
  );

  // Include filter: which tiers to show in the shortlisted panel
  const [includedTiers, setIncludedTiers] = useState<Set<"P0" | "P1">>(new Set(["P0", "P1"]));

  // Saved set for not-shortlisted panel (default = rejected, saved if in set)
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());

  const toggleTier = (filename: string) => {
    setTierMap(prev => ({ ...prev, [filename]: prev[filename] === "P0" ? "P1" : "P0" }));
  };

  const toggleIncludeTier = (tier: "P0" | "P1") => {
    setIncludedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier); else next.add(tier);
      return next;
    });
  };

  const toggleSave = (filename: string) => {
    setSavedSet(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  };

  const handleConfirm = () => {
    const shortlisted: ShortlistEntry[] = initialShortlisted.map(c => ({
      filename: c.filename,
      tier: tierMap[c.filename] ?? (c.aiRating as "P0" | "P1"),
    }));
    const saved = [...savedSet];
    const rejected = initialNotShortlisted.filter(c => !savedSet.has(c.filename)).map(c => c.filename);
    onConfirm(shortlisted, rejected, saved);
  };

  const visibleShortlisted = initialShortlisted.filter(c => {
    const tier = tierMap[c.filename] ?? (c.aiRating as "P0" | "P1");
    return includedTiers.has(tier);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="bg-white shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 820, maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Send Shortlist</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Review and confirm before sending.</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-panel body */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left — Shortlisted */}
          <div className="flex-1 flex flex-col border-r border-neutral-200 overflow-hidden">
            {/* Panel header */}
            <div className="px-5 pt-4 pb-3 border-b border-neutral-100 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-700">
                  Shortlisted — {initialShortlisted.length}
                </p>
              </div>
              {/* Include tier filter */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-neutral-400">Include:</span>
                {(["P0", "P1"] as const).map(tier => {
                  const active = includedTiers.has(tier);
                  return (
                    <button
                      key={tier}
                      onClick={() => toggleIncludeTier(tier)}
                      className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
                        tier === "P0"
                          ? active
                            ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                            : "bg-white border-neutral-200 text-neutral-300"
                          : active
                          ? "bg-blue-100 border-blue-300 text-blue-700"
                          : "bg-white border-neutral-200 text-neutral-300"
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {visibleShortlisted.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-10">No candidates to show</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {visibleShortlisted.map((c, i) => {
                    const tier = tierMap[c.filename] ?? (c.aiRating as "P0" | "P1");
                    const sub = [c.currentRole, c.currentCompany].filter(Boolean).join(" at ");
                    return (
                      <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-neutral-600">{c.name[0]?.toUpperCase()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 truncate">{c.name}</p>
                          {(sub || c.email) && (
                            <p className="text-xs text-neutral-400 mt-0.5 truncate">{sub || c.email}</p>
                          )}
                        </div>
                        {/* Tier toggle chip */}
                        <button
                          onClick={() => toggleTier(c.filename)}
                          title="Click to toggle between P0 and P1"
                          className={`shrink-0 text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
                            tier === "P0"
                              ? "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200"
                              : "bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200"
                          }`}
                        >
                          {tier}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right — Not Shortlisted */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-5 pt-4 pb-3 border-b border-neutral-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neutral-300 shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                    Not Shortlisted — {initialNotShortlisted.length}
                  </p>
                </div>
              </div>
              {/* Bulk actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSavedSet(new Set())}
                  className="text-[11px] font-medium px-3 py-1 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  Reject all
                </button>
                <button
                  onClick={() => setSavedSet(new Set(initialNotShortlisted.map(c => c.filename)))}
                  className="text-[11px] font-medium px-3 py-1 rounded-full border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  Save all for later
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {initialNotShortlisted.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-10">No rejected candidates</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {initialNotShortlisted.map((c, i) => {
                    const isSaved = savedSet.has(c.filename);
                    const sub = [c.currentRole, c.currentCompany].filter(Boolean).join(" at ");
                    return (
                      <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-neutral-400">{c.name[0]?.toUpperCase()}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 truncate">{c.name}</p>
                          {(sub || c.email) && (
                            <p className="text-xs text-neutral-400 mt-0.5 truncate">{sub || c.email}</p>
                          )}
                          {/* Decision badge */}
                          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            isSaved
                              ? "bg-amber-50 border-amber-200 text-amber-600"
                              : "bg-rose-50 border-rose-200 text-rose-600"
                          }`}>
                            {isSaved ? "Saved" : "Reject"}
                          </span>
                        </div>

                        {/* Reject / Save toggle buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => isSaved && toggleSave(c.filename)}
                            className={`text-[11px] font-medium px-3 py-1.5 border rounded transition-colors ${
                              !isSaved
                                ? "bg-rose-50 border-rose-300 text-rose-600"
                                : "bg-white border-neutral-200 text-neutral-400 hover:border-rose-200 hover:text-rose-500"
                            }`}
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => !isSaved && toggleSave(c.filename)}
                            className={`text-[11px] font-medium px-3 py-1.5 border rounded transition-colors ${
                              isSaved
                                ? "bg-amber-50 border-amber-300 text-amber-600"
                                : "bg-white border-neutral-200 text-neutral-400 hover:border-amber-200 hover:text-amber-500"
                            }`}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 shrink-0 bg-neutral-50">
          <button
            onClick={onCancel}
            className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors"
          >
            Confirm &amp; Send Shortlist →
          </button>
        </div>
      </div>
    </div>
  );
}
