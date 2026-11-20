"use client";

import { formatCheckoutTime } from "@/lib/checkout-slack";
import { beforeCaption, spotText, type BeforeAfterPair } from "@/lib/damage-before-after";
import { CarDiagram } from "@/components/car-diagram";

/**
 * Side-by-side photos for each damaged slot: the unit's latest earlier photo of
 * that slot (Before) and this check's (After). Photos load through the app's
 * signed-in photo route; nothing is public.
 */
export function DamageBeforeAfter({
  pairs,
  compact = false,
}: {
  pairs: BeforeAfterPair[];
  compact?: boolean;
}) {
  if (!pairs.length) return null;
  const box = compact ? "h-20" : "aspect-video";
  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div key={pair.angle}>
          <p className="text-xs font-semibold text-gray-700 mb-1">
            {pair.label}
            {pair.spot ? ` · ${spotText(pair.spot)}` : ""}
          </p>
          <div className={pair.spot ? "grid grid-cols-[1fr_1fr_auto] gap-2" : "grid grid-cols-2 gap-2"}>
            <Slot
              src={pair.before?.src}
              alt={`${pair.label} before`}
              caption={beforeCaption(pair, formatCheckoutTime)}
              box={box}
              empty="No earlier photo"
            />
            <Slot
              src={pair.after?.src}
              alt={`${pair.label} after`}
              caption={pair.afterIsCloseUp ? "After · close-up, this check" : "After · this check"}
              box={box}
              empty="No photo on this check"
            />
            {pair.spot && (
              <div className="flex items-start justify-center" title="Where the driver marked the damage">
                <CarDiagram spot={pair.spot} size={compact ? 80 : 110} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Slot({
  src,
  alt,
  caption,
  box,
  empty,
}: {
  src?: string;
  alt: string;
  caption: string;
  box: string;
  empty: string;
}) {
  return (
    <figure className="min-w-0">
      <div className={`rounded-lg border border-gray-200 bg-gray-50 overflow-hidden ${box}`}>
        {src ? (
          <a href={src} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
          </a>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 px-1 text-center">
            {empty}
          </div>
        )}
      </div>
      <figcaption className="text-[11px] text-gray-500 mt-0.5 truncate">{caption}</figcaption>
    </figure>
  );
}
