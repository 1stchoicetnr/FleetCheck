"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChangeBoxMark, OfficePhotoThumb, usePhotoLightbox } from "@/components/photo-lightbox";
import { reviewPhotoCheck, type PhotoCheckFinding } from "@/lib/checkout-api";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { photoCheckViewerSlides } from "@/lib/photo-viewer";

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
  const { open, viewer } = usePhotoLightbox();

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
      {findings.map((f) => {
        const slides = photoCheckViewerSlides(f);
        const before = slides.find((slide) => slide.id === `${f.angle}:before`);
        const newest = slides.find((slide) => slide.id === `${f.angle}:new`);
        return (
          <div key={f.angle} className="rounded-lg border border-amber-300 bg-amber-50/40 p-2 space-y-2">
          <p className="text-xs font-semibold text-gray-800">
            {f.label}: {f.summary} · {Math.round(f.confidence * 100)}% sure
            {f.knownDamageAnswer === "same" ? " · driver said Same as before" : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <figure className="min-w-0">
              <div className="aspect-video rounded border border-gray-200 bg-gray-50 overflow-hidden">
                {f.before?.src && before ? (
                  <OfficePhotoThumb
                    src={f.before.src}
                    label={`${f.label}: ${before.label}`}
                    onOpen={() => open(slides, before.id)}
                  />
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
              <div className="aspect-video rounded border border-gray-200 bg-gray-50 overflow-hidden">
                {f.after.src && newest ? (
                  <OfficePhotoThumb
                    src={f.after.src}
                    label={`${f.label}: ${newest.label}`}
                    onOpen={() => open(slides, newest.id)}
                  >
                    {f.box ? <ChangeBoxMark box={f.box} /> : null}
                  </OfficePhotoThumb>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No photo</div>
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
                <Button type="button" size="sm" variant="danger" disabled={busy !== null} onClick={() => void decide(f.angle, "confirm")}>
                  {busy === `${f.angle}:confirm` ? "Saving…" : "Confirm new damage"}
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decide(f.angle, "dismiss")}>
                  {busy === `${f.angle}:dismiss` ? "Saving…" : "Dismiss"}
                </Button>
              </div>
            )
          )}
          </div>
        );
      })}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      {viewer}
    </div>
  );
}
