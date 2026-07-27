"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { Button } from "./ui/button";
import { Vehicle, VehicleKnownIssue } from "@/lib/types";
import { saveVehicle, getFleetById } from "@/lib/storage";
import { normalizeFleetType } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { dispatchKnownIssueAlert } from "@/lib/alerts";

interface KnownIssueEditorProps {
  vehicle: Vehicle;
  canEdit: boolean;
  userId?: string;
  userName?: string;
  onUpdated: (vehicle: Vehicle) => void;
}

export function KnownIssueEditor({
  vehicle,
  canEdit,
  userId,
  userName,
  onUpdated,
}: KnownIssueEditorProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(vehicle.knownIssue?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const issue = vehicle.knownIssue;
  const isOpen = issue?.isOpen && issue.text.trim();

  const save = async (open: boolean) => {
    setSaving(true);
    try {
      const trimmed = text.trim();
      const knownIssue: VehicleKnownIssue | undefined =
        open && trimmed
          ? {
              text: trimmed,
              isOpen: true,
              updatedAt: new Date().toISOString(),
              updatedBy: userId,
              updatedByName: userName,
            }
          : trimmed
          ? {
              text: trimmed,
              isOpen: false,
              updatedAt: new Date().toISOString(),
              updatedBy: userId,
              updatedByName: userName,
            }
          : undefined;

      const updated: Vehicle = { ...vehicle, knownIssue };
      await saveVehicle(updated);
      onUpdated(updated);

      if (userName && trimmed) {
        const fleet = await getFleetById(vehicle.fleetId);
        if (fleet) {
          const result = await dispatchKnownIssueAlert(
            updated,
            normalizeFleetType(fleet.type),
            userName,
            trimmed,
            open
          );
          if (result.slackSent) {
            setFeedback("Saved — sent to Slack and in-app alerts.");
          } else if (result.inAppCreated) {
            setFeedback(
              `Saved — in-app alert created. Slack: ${result.slackSkippedReason ?? "not sent"}`
            );
          } else {
            setFeedback(
              `Saved. Slack: ${result.slackSkippedReason ?? "not sent"}`
            );
          }
        }
      } else {
        setFeedback("Saved.");
      }

      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit && !isOpen) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wide">
            Known Issue
          </span>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setText(vehicle.knownIssue?.text ?? "");
              setEditing(true);
            }}
            className="text-xs font-medium text-brand-700 flex items-center gap-1"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Left rear window not working – part on order"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={saving || !text.trim()}
              onClick={() => save(true)}
            >
              Save & Open
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={saving}
              onClick={() => save(false)}
            >
              Clear / Resolve
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-2 text-gray-500"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : isOpen ? (
        <>
          <p className="text-sm text-gray-900 leading-snug">{issue!.text}</p>
          {issue!.updatedAt && (
            <p className="text-xs text-gray-500">
              Updated {formatDate(issue!.updatedAt)}
              {issue!.updatedByName ? ` · ${issue!.updatedByName}` : ""}
            </p>
          )}
        </>
      ) : canEdit ? (
        <p className="text-xs text-gray-500">No open known issues.</p>
      ) : null}
      {feedback && (
        <p className="text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-2 py-1.5">
          {feedback}
        </p>
      )}
    </div>
  );
}
