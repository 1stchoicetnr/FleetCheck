"use client";

import { useMemo, useState } from "react";
import { CheckoutReport, PHOTO_ANGLES, PhotoAngle } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface CheckoutPhotoComparisonProps {
  current: CheckoutReport;
  priors: CheckoutReport[];
  highlightAngles?: PhotoAngle[];
}

export function CheckoutPhotoComparison({
  current,
  priors,
  highlightAngles = [],
}: CheckoutPhotoComparisonProps) {
  const [priorId, setPriorId] = useState(priors[0]?.id ?? "");
  const prior = priors.find((p) => p.id === priorId) ?? priors[0];

  const photoMap = (report?: CheckoutReport) =>
    Object.fromEntries(report?.photos.map((p) => [p.angle, p.dataUrl]) ?? []);

  const currentMap = useMemo(() => photoMap(current), [current]);
  const priorMap = useMemo(() => photoMap(prior), [prior]);

  const angles = PHOTO_ANGLES.filter(
    (a) => currentMap[a.angle] || priorMap[a.angle]
  );

  if (priors.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No prior checkout reports for this unit yet. This is the first one on
        file.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {priors.slice(0, 2).map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPriorId(p.id)}
            className={`px-3 py-2 rounded-full text-sm font-medium min-h-[40px] ${
              priorId === p.id
                ? "bg-brand-600 text-white"
                : "bg-white border border-gray-200 text-gray-700"
            }`}
          >
            Prior {i + 1} · {formatDate(p.completedAt)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <span>This report</span>
        <span>Prior ({prior ? formatDate(prior.completedAt) : "—"})</span>
      </div>

      <div className="space-y-5">
        {angles.map((a) => {
          const flagged = highlightAngles.includes(a.angle);
          return (
            <div
              key={a.angle}
              className={flagged ? "rounded-xl ring-2 ring-orange-400 p-2" : ""}
            >
              <p className="text-sm font-semibold text-gray-800 mb-2">
                {a.label}
                {flagged ? " · retake requested" : ""}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden aspect-video">
                  {currentMap[a.angle] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentMap[a.angle]}
                      alt={`Current ${a.label}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                      No photo
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden aspect-video">
                  {priorMap[a.angle] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={priorMap[a.angle]}
                      alt={`Prior ${a.label}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                      No photo
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
