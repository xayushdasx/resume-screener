import React, { useState } from "react";
import { ArrowLeft, Award } from "lucide-react";

const DEPARTMENTS = [
  "Product", "Engineering", "Design", "Data & Analytics",
  "Marketing", "Sales", "Operations", "HR", "Finance", "Other",
];

interface CreateRoleProps {
  onBack: () => void;
  onCreate: (title: string, department?: string) => void;
}

export function CreateRole({ onBack, onCreate }: CreateRoleProps) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim(), department || undefined);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-neutral-900">
      {/* Top bar */}
      <div className="px-8 py-4 border-b border-neutral-200 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2.5 mr-3">
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
      </div>

      <div className="flex-1 flex items-start justify-center pt-20 px-8">
        <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col gap-10">
          <div>
            <h1 className="font-serif text-4xl text-neutral-900 mb-2">New Role</h1>
            <p className="text-sm text-neutral-500">
              Give it a name. You'll define criteria and run shortlists from the role page.
            </p>
          </div>

          <div className="flex flex-col gap-7">
            {/* Role title */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Role Title <span className="text-red-400">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Associate PM, SWE-2, Growth Analyst"
                className="w-full text-lg pb-2 border-b-2 border-neutral-200 focus:border-emerald-700 outline-none bg-transparent text-neutral-900 placeholder-neutral-300 transition-colors"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                Department <span className="text-neutral-300 font-normal normal-case">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {DEPARTMENTS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepartment(prev => prev === d ? "" : d)}
                    className={`text-xs font-medium px-3 py-1.5 border transition-colors ${
                      department === d
                        ? "bg-neutral-900 border-neutral-900 text-white"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-6 py-3 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Role →
            </button>
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
