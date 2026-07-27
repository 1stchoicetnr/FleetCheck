"use client";

import { PhotoAngle } from "@/lib/types";
import { PHOTO_EXAMPLE_PATHS } from "@/lib/photo-examples";

export function PhotoExampleImage({
  angle,
  className = "",
}: {
  angle: PhotoAngle;
  className?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={PHOTO_EXAMPLE_PATHS[angle]}
      alt={`Example: ${angle}`}
      className={`${className} object-cover bg-[#0f172a]`}
    />
  );
}

export function PhotoExampleCard({
  angle,
  label,
  className = "",
  category,
}: {
  angle: PhotoAngle;
  label: string;
  className?: string;
  category: "exterior" | "detail" | "interior";
}) {
  const isInterior = category === "interior";
  const isDetail = category === "detail";

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/85">
        Example — {label}
      </p>
      <div
        className="relative overflow-hidden rounded-xl border border-gray-600/80 bg-[#0f172a] shadow-inner"
        style={{ aspectRatio: isInterior || isDetail ? "4/3" : "16/9" }}
      >
        <PhotoExampleImage angle={angle} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent pt-10 pb-2.5 px-3">
          <p className="text-center text-[11px] text-gray-300 leading-snug">
            {category === "exterior"
              ? "Hold phone sideways (landscape) · whole vehicle in frame · sharp focus"
              : isDetail
              ? "Get close · center the area · hold steady for a sharp photo"
              : "Keep the subject sharp and readable · landscape not required"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PhotoExampleThumb({
  angle,
  label,
  className = "",
}: {
  angle: PhotoAngle;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border-2 border-emerald-400/45 shadow-lg bg-[#0f172a] ${className}`}
      title={`Example: ${label}`}
    >
      <PhotoExampleImage angle={angle} className="h-full w-full" />
      <div className="absolute inset-x-0 bottom-0 bg-black/75 py-0.5">
        <p className="text-center text-[9px] font-bold text-emerald-300 uppercase tracking-wide">
          Example
        </p>
      </div>
    </div>
  );
}
