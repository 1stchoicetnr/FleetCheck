"use client";

import { PhotoStep } from "@/lib/types";

const STROKE = "rgba(134, 239, 172, 0.5)";
const STROKE_SOFT = "rgba(134, 239, 172, 0.28)";

type GuideMode = "fullscreen" | "inline";

interface PhotoFrameGuideProps {
  category: PhotoStep["category"];
  mode?: GuideMode;
  className?: string;
}

/**
 * Simple geometric guide: rectangle frame + horizontal center line.
 * No vehicle silhouettes or outlines.
 */
export function PhotoFrameGuide({
  category,
  mode = "fullscreen",
  className = "",
}: PhotoFrameGuideProps) {
  const isExterior = category === "exterior";
  const isDetail = category === "detail";
  const inline = mode === "inline";
  const sw = inline ? 0.65 : 0.5;

  const frame = isExterior
    ? { x: 8, y: 12, w: 84, h: 76 }
    : isDetail
    ? { x: 14, y: 18, w: 72, h: 64 }
    : { x: 22, y: 24, w: 56, h: 52 };

  const centerY = frame.y + frame.h / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      {!inline && <rect width="100" height="100" fill="rgba(0,0,0,0.34)" />}

      <rect
        x={frame.x}
        y={frame.y}
        width={frame.w}
        height={frame.h}
        fill="none"
        stroke={STROKE}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />

      <line
        x1={frame.x}
        y1={centerY}
        x2={frame.x + frame.w}
        y2={centerY}
        stroke={STROKE_SOFT}
        strokeWidth={sw * 0.7}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function PhotoFrameGuidePreview({
  category,
  className = "",
}: {
  category: PhotoStep["category"];
  className?: string;
}) {
  const isExterior = category === "exterior";
  const isDetail = category === "detail";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-emerald-400/20 bg-[#0a0f0c] ${className}`}
      style={{ aspectRatio: isExterior ? "16/10" : "4/3" }}
    >
      <PhotoFrameGuide
        category={category}
        mode="inline"
        className="absolute inset-0 h-full w-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent pt-8 pb-2">
        <p className="text-center text-[11px] font-medium tracking-wide text-emerald-400/75">
          {isExterior
            ? "Fit the whole vehicle inside the green rectangle"
            : isDetail
            ? "Center the area in the green rectangle — hold steady"
            : "Center the display inside the green rectangle"}
        </p>
      </div>
    </div>
  );
}
