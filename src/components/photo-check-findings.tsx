"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { reviewPhotoCheck, type PhotoCheckFinding } from "@/lib/checkout-api";
import { formatCheckoutTime } from "@/lib/checkout-slack";

/** "Found by photo check": before and after with the change boxed, plus Confirm / Dismiss. Nothing is sent until Confirm. */
export function PhotoCheckFindings({
  reportId,
  findings,
  canDecide,
  onDone,
}: {
  reportId: string;
  findings: PhotoCheckFinding[];
  canDecide: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(angle: string, verdict: "confirm" | "dismiss") {
    setBusy(`${angle}:${verdict}`);
    setError("");
    try {
      await reviewPhotoCheck(reportId, angle, verdict);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="text-xs text-gray-500">
        Office only. Nothing goes to Slack or Bell unless you confirm.
      </p>
      {findings.map((f) => (
        <div key={f.angle} className="rounded-lg border border-amber-300 bg-amber-50/40 p-2 space-y-2">
          <p className="text-xs font-semibold text-gray-800">
            {f.label}: {f.summary} · {Math.round(f.confidence * 100)}% sure
            {f.knownDamageAnswer === "same" ? " · driver said Same as before" : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <figure className="min-w-0">
              <div className="aspect-video rounded border border-gray-200 bg-gray-50 overflow-hidden">
                {f.before ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.before.src} alt={`${f.label} before`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No earlier photo</div>
                )}
              </div>
              <figcaption className="text-[11px] text-gray-500 truncate">
                {f.before
                  ? `${f.againstKind === "known" ? "Known" : "Last clean"} · ${formatCheckoutTime(f.before.completedAt)} · ${f.before.driverName}`
                  : "No earlier photo"}
              </figcaption>
            </figure>
            <figure className="min-w-0">
              <div className="relative aspect-video rounded border border-gray-200 bg-gray-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.after.src} alt={`${f.label} after`} className="h-full w-full object-cover" />
                {f.box && (
                  <div
                    className="absolute border-2 border-red-600 bg-red-500/10 rounded"
                    style={{
                      left: `${f.box.x * 100}%`,
                      top: `${f.box.y * 100}%`,
                      width: `${f.box.w * 100}%`,
                      height: `${f.box.h * 100}%`,
                    }}
                    aria-label="Likely change"
                  />
                )}
              </div>
              <figcaption className="text-[11px] text-gray-500 truncate">
                This check · {formatCheckoutTime(f.after.completedAt)} · {f.after.driverName}
              </figcaption>
            </figure>
          </div>
          {f.review ? (
            <p className="text-xs text-gray-600">
              {f.review.verdict === "confirmed" ? "Confirmed" : "Dismissed"} by {f.review.by} · {formatCheckoutTime(f.review.at)}
            </p>
          ) : (
            canDecide && (
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void decide(f.angle, "confirm")}>
                  {busy === `${f.angle}:confirm` ? "Saving…" : "Confirm new damage"}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decide(f.angle, "dismiss")}>
                  {busy === `${f.angle}:dismiss` ? "Saving…" : "Dismiss"}
                </Button>
              </div>
            )
          )}
        </div>
      ))}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
