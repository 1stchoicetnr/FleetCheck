"use client";

import { useEffect } from "react";
import { restoreNaturalOrientation } from "@/lib/orientation";

/** Clear leftover fullscreen / landscape locks. */
export function OrientationUnlock() {
  useEffect(() => {
    void restoreNaturalOrientation();
  }, []);
  return null;
}
