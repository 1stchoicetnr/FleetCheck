"use client";

import { useEffect, useState } from "react";

export type DeviceOrientation = "portrait" | "landscape";

export interface ViewportSize {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface DeviceOrientationState extends ViewportSize {
  orientation: DeviceOrientation;
  isLandscape: boolean;
  /** Increments on every orientation or viewport change — use to re-sync video layout. */
  version: number;
}

function readViewport(): ViewportSize {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    aspectRatio: width / Math.max(height, 1),
  };
}

/**
 * Prefer the Screen Orientation API / window.orientation over comparing
 * innerWidth/innerHeight. A leftover landscape lock (or a CSS rotate) can
 * swap the viewport while the phone is still physically portrait.
 */
function readIsLandscape(width: number, height: number): boolean {
  const type = screen.orientation?.type;
  if (type) return type.startsWith("landscape");
  const angle = (window as Window & { orientation?: number }).orientation;
  if (typeof angle === "number") return Math.abs(angle) === 90;
  return width > height;
}

/** Tracks device orientation and viewport dimensions across resize / rotation. */
export function useDeviceOrientation(): DeviceOrientationState {
  const [state, setState] = useState<DeviceOrientationState>(() => ({
    orientation: "portrait",
    isLandscape: false,
    width: 0,
    height: 0,
    aspectRatio: 1,
    version: 0,
  }));

  useEffect(() => {
    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { width, height, aspectRatio } = readViewport();
        const isLandscape = readIsLandscape(width, height);
        setState((prev) => ({
          orientation: isLandscape ? "landscape" : "portrait",
          isLandscape,
          width,
          height,
          aspectRatio,
          version: prev.version + 1,
        }));
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    if (screen.orientation) {
      screen.orientation.addEventListener("change", update);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      screen.orientation?.removeEventListener("change", update);
    };
  }, []);

  return state;
}

/** @deprecated Use useDeviceOrientation */
export function useIsLandscape(): boolean {
  return useDeviceOrientation().isLandscape;
}
