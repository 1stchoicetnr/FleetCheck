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
        const isLandscape = width > height;
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
