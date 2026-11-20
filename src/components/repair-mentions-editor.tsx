"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { REPAIR_MENTIONS_MAX, cleanRepairMentions, type RepairMention } from "@/lib/repair-report";

/** Who the repair report tags in #rad-cab-repairs, per fleet. Saved with the panel's Save Settings. */
export function RepairMentionsEditor({
  fleets,
  mentions,
  onChange,
}: {
  fleets: ReadonlyArray<{ id: string; name: string }>;
  mentions: Record<string, RepairMention[]>;
  onChange: (next: Record<string, RepairMention[]>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { id: string; name: string }>>({});
  const [error, setError] = useState("");

  function add(fleetId: string) {
    const draft = drafts[fleetId] ?? { id: "", name: "" };
    const list = mentions[fleetId] ?? [];
    const next = cleanRepairMentions([...list, draft]) ?? list;
    if (next.length === list.length) {
      setError(
        list.length >= REPAIR_MENTIONS_MAX
          ? `Up to ${REPAIR_MENTIONS_MAX} people per fleet.`
          : "Enter a Slack member ID like U07RCTY13J5 (Slack profile → ⋮ → Copy member ID)."
      );
      return;
    }
    setError("");
    onChange({ ...mentions, [fleetId]: next });
    setDrafts({ ...drafts, [fleetId]: { id: "", name: "" } });
  }

  const inputClass =
    "w-full rounded-lg border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-[#f7f7f8]";

  return (
    <div className="space-y-3">
      {fleets.map((fleet) => {
        const list = mentions[fleet.id] ?? [];
        const draft = drafts[fleet.id] ?? { id: "", name: "" };
        return (
          <div key={fleet.id} className="space-y-2 rounded-xl border border-[#3a3a40] p-3">
            <p className="text-sm font-semibold text-ink">{fleet.name}</p>
            {list.length === 0 && <p className="text-xs text-muted">Nobody is tagged.</p>}
            {list.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {m.name} <span className="text-xs text-muted">({m.id})</span>
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-400 underline"
                  onClick={() => onChange({ ...mentions, [fleet.id]: list.filter((x) => x.id !== m.id) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputClass}
                placeholder="Name"
                value={draft.name}
                onChange={(e) => setDrafts({ ...drafts, [fleet.id]: { ...draft, name: e.target.value } })}
              />
              <input
                className={inputClass}
                placeholder="Slack member ID"
                value={draft.id}
                onChange={(e) => setDrafts({ ...drafts, [fleet.id]: { ...draft, id: e.target.value } })}
              />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => add(fleet.id)}>
              Add person
            </Button>
          </div>
        );
      })}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
