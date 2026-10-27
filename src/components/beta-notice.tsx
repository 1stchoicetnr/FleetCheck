"use client";

import { useEffect, useState } from "react";
import { BETA_NOTICE, BETA_NOTICE_KEY } from "@/lib/beta-notice";

export function BetaNotice({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(sessionStorage.getItem(BETA_NOTICE_KEY) !== "1");
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(BETA_NOTICE_KEY, "1");
    } catch {
      /* private mode can block storage; hiding for this view is enough */
    }
    setOpen(false);
  };

  const dark = tone === "dark";
  return (
    <div
      className={`beta-notice flex items-start gap-2 rounded-xl border px-2.5 py-1.5 ${
        dark
          ? "border-white/15 bg-white/10 text-[#e4e4e7]"
          : "border-slate-200 bg-white text-slate-700"
      }`}
      role="status"
    >
      <p className="min-w-0 flex-1 text-xs leading-snug">{BETA_NOTICE}</p>
      <button
        type="button"
        onClick={dismiss}
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-base leading-none ${
          dark ? "text-[#e4e4e7] hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"
        }`}
        aria-label="Dismiss beta notice"
      >
        ×
      </button>
    </div>
  );
}
