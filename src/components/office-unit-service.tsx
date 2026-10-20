"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { updateSharedVehicleService, SharedVehicle } from "@/lib/checkout-api";
import { getOilChangeStatus, oilChangeStatusLabel } from "@/lib/oil-change";
import { VehicleKnownIssue } from "@/lib/types";
import { formatDate, formatMileage } from "@/lib/utils";

const KNOWN_ISSUE_MAX = 1000;

export function OfficeUnitService({
  vehicle,
  userId,
  userName,
  onUpdated,
}: {
  vehicle: SharedVehicle;
  userId?: string;
  userName?: string;
  onUpdated: (vehicle: SharedVehicle) => void;
}) {
  const [editingIssue, setEditingIssue] = useState(false);
  const [issueText, setIssueText] = useState(vehicle.knownIssue?.text ?? "");
  const [oilValue, setOilValue] = useState(
    vehicle.lastOilChangeMileage?.toString() ?? ""
  );
  const [saving, setSaving] = useState<"issue" | "oil" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const issue = vehicle.knownIssue;
  const isOpen = Boolean(issue?.isOpen && issue.text.trim());
  const oilStatus = getOilChangeStatus(vehicle, vehicle.lastMileage ?? 0);

  const saveIssue = async (open: boolean) => {
    const text = issueText.trim();
    if (text.length > KNOWN_ISSUE_MAX) {
      setError("Known issue is too long.");
      return;
    }
    setSaving("issue");
    setError("");
    setSaved("");
    try {
      const knownIssue: VehicleKnownIssue | null = text
        ? {
            text,
            isOpen: open,
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
            updatedByName: userName,
          }
        : null;
      const updated = await updateSharedVehicleService(vehicle.id, { knownIssue });
      onUpdated(updated);
      setIssueText(updated.knownIssue?.text ?? "");
      setEditingIssue(false);
      setSaved(open && text ? "Known issue saved." : "Known issue updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the known issue.");
    } finally {
      setSaving(null);
    }
  };

  const saveOil = async () => {
    const trimmed = oilValue.trim();
    const mileage = Number(trimmed);
    if (!trimmed || !Number.isInteger(mileage) || mileage < 0 || mileage > 2_000_000) {
      setError("Enter a whole mileage from 0 to 2,000,000.");
      return;
    }
    setSaving("oil");
    setError("");
    setSaved("");
    try {
      const updated = await updateSharedVehicleService(vehicle.id, {
        lastOilChangeMileage: mileage,
      });
      onUpdated(updated);
      setSaved("Oil change mileage saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the oil change mileage.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-100">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wide">Known issue</span>
          </div>
          {!editingIssue && (
            <button
              type="button"
              onClick={() => {
                setIssueText(vehicle.knownIssue?.text ?? "");
                setEditingIssue(true);
                setSaved("");
              }}
              className="text-xs font-medium text-amber-100 flex items-center gap-1"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
        {editingIssue ? (
          <div className="space-y-2">
            <textarea
              value={issueText}
              maxLength={KNOWN_ISSUE_MAX}
              onChange={(e) => setIssueText(e.target.value)}
              placeholder="e.g. Left rear window not working – part on order"
              rows={3}
              className="w-full rounded-lg border border-amber-700/40 bg-[#1c1c1e] px-3 py-2 text-sm text-white"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={saving === "issue" || !issueText.trim()}
                onClick={() => saveIssue(true)}
              >
                Save & open
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                disabled={saving === "issue"}
                onClick={() => saveIssue(false)}
              >
                Resolve
              </Button>
              <button
                type="button"
                onClick={() => setEditingIssue(false)}
                className="p-2 text-amber-100"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : isOpen ? (
          <>
            <p className="text-sm text-amber-50 leading-snug">{issue!.text}</p>
            {issue!.updatedAt && (
              <p className="text-xs text-amber-100/80">
                Updated {formatDate(issue!.updatedAt)}
                {issue!.updatedByName ? ` · ${issue!.updatedByName}` : ""}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-amber-100/80">No open known issues.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-500">{oilChangeStatusLabel(oilStatus)}</p>
        {vehicle.lastOilChangeMileage != null && (
          <p className="text-xs text-gray-500">
            Last oil change: {formatMileage(vehicle.lastOilChangeMileage)}
          </p>
        )}
        <div className="flex gap-2 items-end">
          <Input
            label="Last oil change mileage"
            type="number"
            inputMode="numeric"
            value={oilValue}
            onChange={(e) => setOilValue(e.target.value)}
            placeholder="e.g. 40000"
            className="flex-1"
          />
          <Button size="sm" onClick={saveOil} disabled={saving === "oil"}>
            {saving === "oil" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {saved && <p className="text-xs text-emerald-700 font-medium">{saved}</p>}
    </div>
  );
}
