"use client";

import { MaintenanceIssue, MAINTENANCE_ISSUES } from "@/lib/types";
import { VoiceInput } from "./voice-input";
import { Check } from "lucide-react";

interface DamageMaintenanceReportProps {
  selected: MaintenanceIssue[];
  onToggle: (issue: MaintenanceIssue) => void;
  onClearAll: () => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  priorityIds?: MaintenanceIssue[];
}

export function DamageMaintenanceReport({
  selected,
  onToggle,
  onClearAll,
  notes,
  onNotesChange,
  priorityIds = [],
}: DamageMaintenanceReportProps) {
  const sorted = [...MAINTENANCE_ISSUES].sort((a, b) => {
    const ai = priorityIds.indexOf(a.id);
    const bi = priorityIds.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900">Damage & Maintenance</h2>
        <p className="text-base text-gray-600 mt-1">
          Check everything you noticed. Tap again to uncheck.
        </p>
      </div>

      <button
        type="button"
        onClick={onClearAll}
        className={`w-full p-4 rounded-2xl border-2 text-left transition-colors min-h-[64px] ${
          selected.length === 0
            ? "border-green-500 bg-green-50"
            : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <span className="text-base font-bold text-gray-900 block">
              No Issues — All Good
            </span>
            <span className="text-sm text-gray-600">
              Tap here if nothing needs reporting
            </span>
          </div>
          {selected.length === 0 && (
            <Check className="h-6 w-6 text-green-600 ml-auto flex-shrink-0" />
          )}
        </div>
      </button>

      <div className="space-y-3">
        {sorted.map((issue) => {
          const checked = selected.includes(issue.id);
          return (
            <label
              key={issue.id}
              className={`flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-colors min-h-[72px] ${
                checked
                  ? "border-brand-600 bg-brand-50"
                  : "border-gray-200 bg-white active:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(issue.id)}
                className="sr-only"
              />
              <span className="text-2xl flex-shrink-0 mt-0.5" aria-hidden>
                {issue.icon}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold text-gray-900 block leading-snug">
                  {issue.label}
                </span>
                <span className="text-sm text-gray-600 block mt-0.5">
                  {issue.description}
                </span>
              </div>
              <div
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  checked
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-gray-300 bg-white"
                }`}
                aria-hidden
              >
                {checked && <Check className="h-4 w-4" />}
              </div>
            </label>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-sm font-semibold text-gray-700">
            Add details (optional)
          </p>
          <VoiceInput
            value={notes}
            onChange={onNotesChange}
            placeholder="Describe the damage or issue..."
            rows={3}
          />
        </div>
      )}
    </div>
  );
}
