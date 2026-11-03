"use client";

import { useEffect } from "react";
import { isStaleBuild } from "@/lib/build-version";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In dev, always unregister SW and clear caches so phones get fresh JS bundles.
    if (process.env.NODE_ENV === "development") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
      }
      return;
    }

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});

    // Reload when the server is on a newer build than this page.
    const checkVersion = () => {
      fetch("/api/version", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { build?: string } | null) => {
          if (!isStaleBuild(BUILD_ID, data?.build)) return;
          const key = `inspekt-reload-${data?.build}`;
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
          window.location.reload();
        })
        .catch(() => {});
    };
    checkVersion();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
