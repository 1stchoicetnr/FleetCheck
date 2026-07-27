"use client";

import { useMemo, useState } from "react";
import { CheckRecord, PHOTO_ANGLES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface PhotoComparisonProps {
  checkIns: CheckRecord[];
}

export function PhotoComparison({ checkIns }: PhotoComparisonProps) {
  const sorted = useMemo(
    () =>
      [...checkIns].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [checkIns]
  );

  const [prevId, setPrevId] = useState(sorted[1]?.id ?? sorted[0]?.id ?? "");
  const [currId, setCurrId] = useState(sorted[0]?.id ?? "");

  const previous = sorted.find((c) => c.id === prevId);
  const current = sorted.find((c) => c.id === currId);

  const anglesWithPhotos = PHOTO_ANGLES.filter((a) => {
    const p = previous?.photos.find((x) => x.angle === a.angle);
    const c = current?.photos.find((x) => x.angle === a.angle);
    return p?.dataUrl || c?.dataUrl;
  });

  if (sorted.length < 2) {
    return (
      <p className="text-sm text-gray-500">
        Need at least two check-in records to compare photos.
      </p>
    );
  }

  const photoMap = (check: CheckRecord | undefined) =>
    Object.fromEntries(check?.photos.map((p) => [p.angle, p.dataUrl]) ?? []);

  const prevMap = photoMap(previous);
  const currMap = photoMap(current);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-gray-700 block mb-1">Previous</span>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={prevId}
            onChange={(e) => setPrevId(e.target.value)}
          >
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.createdAt)} · {c.driverName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-gray-700 block mb-1">Current</span>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={currId}
            onChange={(e) => setCurrId(e.target.value)}
          >
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.createdAt)} · {c.driverName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-6">
        {anglesWithPhotos.map((a) => (
          <div key={a.angle}>
            <p className="text-sm font-semibold text-gray-800 mb-2">{a.label}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden aspect-video">
                {prevMap[a.angle] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={prevMap[a.angle]}
                    alt={`Previous ${a.label}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-gray-400">
                    No photo
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden aspect-video">
                {currMap[a.angle] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currMap[a.angle]}
                    alt={`Current ${a.label}`}
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
        ))}
      </div>
    </div>
  );
}
