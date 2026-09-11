"use client";

import { PhotoAngle, PhotoStep } from "@/lib/types";

const STROKE = "rgba(134, 239, 172, 0.55)";
const STROKE_SOFT = "rgba(134, 239, 172, 0.3)";
const FILL = "rgba(134, 239, 172, 0.06)";

type GuideMode = "fullscreen" | "inline";

interface PhotoFrameGuideProps {
  category: PhotoStep["category"];
  angle?: PhotoAngle;
  mode?: GuideMode;
  className?: string;
}

function guideKind(angle?: PhotoAngle, category?: PhotoStep["category"]) {
  if (!angle) return category === "detail" ? "detail" : category === "interior" ? "cabin" : "van";
  if (angle.includes("tire")) return "tire";
  if (angle.includes("wheel")) return "wheel";
  if (angle === "front") return "front";
  if (angle === "rear") return "rear";
  if (angle.includes("corner")) return "corner";
  if (angle.includes("fender") || angle.includes("quarter")) return "panel";
  if (angle.includes("doors")) return "side";
  if (angle === "odometer_fuel") return "dash";
  if (angle === "registration") return "document";
  if (angle === "windshield") return "windshield";
  if (angle === "radio_climate") return "panel";
  if (angle === "engine_oil") return "engine";
  if (angle === "trunk_interior") return "cargo";
  if (angle.includes("_in")) return "cabin";
  return category === "detail" ? "detail" : "van";
}

function Silhouette({
  kind,
  sw,
}: {
  kind: ReturnType<typeof guideKind>;
  sw: number;
}) {
  if (kind === "tire") {
    return (
      <>
        <circle cx="50" cy="52" r="28" fill={FILL} stroke={STROKE} strokeWidth={sw} />
        <circle cx="50" cy="52" r="12" fill="none" stroke={STROKE_SOFT} strokeWidth={sw * 0.8} />
      </>
    );
  }
  if (kind === "wheel") {
    return (
      <>
        <circle cx="50" cy="52" r="30" fill={FILL} stroke={STROKE} strokeWidth={sw} />
        <circle cx="50" cy="52" r="8" fill="none" stroke={STROKE} strokeWidth={sw} />
        {[0, 60, 120].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={50 + Math.cos(rad) * 8}
              y1={52 + Math.sin(rad) * 8}
              x2={50 + Math.cos(rad) * 28}
              y2={52 + Math.sin(rad) * 28}
              stroke={STROKE_SOFT}
              strokeWidth={sw * 0.7}
            />
          );
        })}
      </>
    );
  }
  if (kind === "front") {
    return (
      <path
        d="M22 70 L28 42 Q50 28 72 42 L78 70 Q50 76 22 70 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={sw}
      />
    );
  }
  if (kind === "rear") {
    return (
      <path
        d="M20 38 H80 V68 Q50 78 20 68 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={sw}
      />
    );
  }
  if (kind === "corner") {
    return (
      <path
        d="M18 62 L26 40 Q42 28 70 34 L84 46 V70 Q50 80 22 70 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={sw}
      />
    );
  }
  if (kind === "side") {
    return (
      <path
        d="M10 58 L18 40 H78 L90 56 V70 H10 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={sw}
      />
    );
  }
  if (kind === "dash") {
    return (
      <>
        <rect x="18" y="28" width="64" height="40" rx="4" fill={FILL} stroke={STROKE} strokeWidth={sw} />
        <rect x="26" y="36" width="22" height="12" rx="1" fill="none" stroke={STROKE_SOFT} strokeWidth={sw * 0.8} />
        <circle cx="64" cy="42" r="7" fill="none" stroke={STROKE} strokeWidth={sw} />
      </>
    );
  }
  if (kind === "document") {
    return (
      <rect x="28" y="22" width="44" height="56" rx="2" fill={FILL} stroke={STROKE} strokeWidth={sw} />
    );
  }
  if (kind === "windshield") {
    return (
      <path
        d="M18 68 L28 30 H72 L82 68 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={sw}
      />
    );
  }
  if (kind === "engine") {
    return (
      <>
        <rect x="20" y="30" width="60" height="40" rx="3" fill={FILL} stroke={STROKE} strokeWidth={sw} />
        <line x1="50" y1="34" x2="50" y2="66" stroke={STROKE_SOFT} strokeWidth={sw} />
      </>
    );
  }
  if (kind === "cargo") {
    return (
      <rect x="16" y="26" width="68" height="50" rx="3" fill={FILL} stroke={STROKE} strokeWidth={sw} />
    );
  }
  if (kind === "cabin") {
    return (
      <path
        d="M24 70 V40 Q50 22 76 40 V70"
        fill="none"
        stroke={STROKE}
        strokeWidth={sw}
      />
    );
  }
  return (
    <path
      d="M16 66 L24 42 Q50 30 76 42 L84 66 Q50 76 16 66 Z"
      fill={FILL}
      stroke={STROKE}
      strokeWidth={sw}
    />
  );
}

/**
 * Live-preview alignment ghost. Per-angle silhouette over the camera video.
 * Native Take photo cannot host this overlay.
 */
export function PhotoFrameGuide({
  category,
  angle,
  mode = "fullscreen",
  className = "",
}: PhotoFrameGuideProps) {
  const inline = mode === "inline";
  const sw = inline ? 0.7 : 0.55;
  const kind = guideKind(angle, category);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      {!inline && <rect width="100" height="100" fill="rgba(0,0,0,0.28)" />}
      <Silhouette kind={kind} sw={sw} />
    </svg>
  );
}

export function PhotoFrameGuidePreview({
  category,
  angle,
  className = "",
}: {
  category: PhotoStep["category"];
  angle?: PhotoAngle;
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
        angle={angle}
        mode="inline"
        className="absolute inset-0 h-full w-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent pt-8 pb-2">
        <p className="text-center text-[11px] font-medium tracking-wide text-emerald-400/75">
          {isExterior
            ? "Line the van up with the ghost outline"
            : isDetail
              ? "Center the part in the ghost guide — hold steady"
              : "Center the subject in the ghost guide"}
        </p>
      </div>
    </div>
  );
}
