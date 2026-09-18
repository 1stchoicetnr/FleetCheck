"use client";

import { useEffect } from "react";
import { restoreNaturalOrientation } from "@/lib/orientation";

/** Clear leftover fullscreen / landscape locks from camera sessions. */
export function OrientationUnlock() {
  useEffect(() => {
    void restoreNaturalOrientation();
  }, []);
  return null;
}
