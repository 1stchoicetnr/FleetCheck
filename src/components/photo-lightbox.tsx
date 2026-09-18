"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

export type LightboxPhoto = {
  id: string;
  src: string;
  label: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 320;
const SWIPE_PX = 48;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function OfficePhotoThumb({
  src,
  label,
  onOpen,
}: {
  src: string;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Enlarge ${label}`}
      className="relative block w-full h-full bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="w-full h-full object-cover" />
      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 p-1 text-white pointer-events-none">
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );
  const swipeRef = useRef<{ x: number; y: number; y0: number; onImage: boolean } | null>(
    null
  );
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    pinchRef.current = null;
    panRef.current = null;
    swipeRef.current = null;
  }, []);

  useEffect(() => {
    resetTransform();
  }, [index, resetTransform]);

  const go = useCallback(
    (delta: number) => {
      if (index == null || photos.length < 2) return;
      const next = (index + delta + photos.length) % photos.length;
      onIndexChange(next);
    },
    [index, onIndexChange, photos.length]
  );

  const applyScale = useCallback((next: number) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    setScale(clamped);
    scaleRef.current = clamped;
    if (clamped <= MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
      offsetRef.current = { x: 0, y: 0 };
    }
  }, []);

  useEffect(() => {
    if (index == null || !mounted) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };

    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, index, mounted, onClose]);

  useEffect(() => {
    if (index == null || !mounted) return;
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyScale(scaleRef.current * (e.deltaY < 0 ? 1.12 : 0.88));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [applyScale, index, mounted]);

  if (!mounted || index == null) return null;
  const photo = photos[index];
  if (!photo) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-lightbox-chrome]")) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;

    const onImage = Boolean(target.closest("img"));

    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: pointerDistance(pts[0], pts[1]),
        scale: scaleRef.current,
      };
      panRef.current = null;
      swipeRef.current = null;
      return;
    }

    if (scaleRef.current > MIN_SCALE) {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: offsetRef.current.x,
        oy: offsetRef.current.y,
      };
      swipeRef.current = null;
    } else {
      swipeRef.current = { x: e.clientX, y: e.clientY, y0: e.clientY, onImage };
      panRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = pointerDistance(pts[0], pts[1]);
      if (pinchRef.current.distance > 0) {
        applyScale(pinchRef.current.scale * (dist / pinchRef.current.distance));
      }
      movedRef.current = true;
      return;
    }

    if (panRef.current && scaleRef.current > MIN_SCALE) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
      const next = {
        x: panRef.current.ox + dx,
        y: panRef.current.oy + dy,
      };
      setOffset(next);
      offsetRef.current = next;
      return;
    }

    if (swipeRef.current) {
      const dx = e.clientX - swipeRef.current.x;
      const dy = e.clientY - swipeRef.current.y0;
      if (Math.abs(dx) + Math.abs(dy) > 8) movedRef.current = true;
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointersRef.current.get(e.pointerId);
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;

    if (pointersRef.current.size > 0) return;

    const swipe = swipeRef.current;
    swipeRef.current = null;

    const now = Date.now();
    const dx = start ? e.clientX - start.x : 0;
    const dy = start ? e.clientY - start.y : 0;

    if (
      swipe &&
      scaleRef.current <= MIN_SCALE &&
      Math.abs(dx) >= SWIPE_PX &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      go(dx < 0 ? 1 : -1);
      lastTapRef.current = null;
      return;
    }

    if (!movedRef.current && start) {
      const prev = lastTapRef.current;
      if (
        prev &&
        now - prev.t < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 36
      ) {
        lastTapRef.current = null;
        if (scaleRef.current > MIN_SCALE) applyScale(1);
        else applyScale(2.5);
        return;
      }
      lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };

      const onImage = Boolean((e.target as HTMLElement).closest("img"));
      if (!onImage && !swipe?.onImage) onClose();
    }
  };

  const content = (
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={photo.label}
      data-photo-lightbox=""
    >
      <div
        data-lightbox-chrome=""
        className="absolute top-0 left-0 right-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8"
      >
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-brand-300 text-xs font-bold tracking-wide uppercase">
            Photo {index + 1} / {photos.length}
          </p>
          <h2 className="text-white text-lg sm:text-xl font-bold leading-tight drop-shadow-md">
            {photo.label}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex-shrink-0 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-sm"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        ref={stageRef}
        className="absolute inset-0 flex items-center justify-center overflow-auto overscroll-contain"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={photo.label}
          draggable={false}
          className="photo-lightbox-image"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        />
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            data-lightbox-chrome=""
            onClick={() => go(-1)}
            className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            data-lightbox-chrome=""
            onClick={() => go(1)}
            className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Next photo"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
