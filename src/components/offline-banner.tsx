"use client";

import { usePendingSync } from "@/hooks/use-offline";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { count, retry, retrying, online } = usePendingSync();

  if (online && count === 0) return null;

  const waiting = count > 0;
  return (
    <div
      className={`px-4 py-3 text-sm font-medium flex flex-wrap items-center justify-center gap-3 ${
        waiting ? "bg-amber-100 text-amber-950" : "bg-orange-50 text-orange-800"
      }`}
    >
      {!online && <WifiOff className="h-4 w-4" />}
      <p>
        {waiting
          ? online
            ? "This check didn't finish uploading. It is still on this phone."
            : "This check didn't finish uploading. It stays on this phone until there is a signal."
          : "Offline — checks and photos stay on this phone."}
      </p>
      {waiting && (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying || !online}
          className="min-h-10 rounded-lg bg-amber-700 px-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}
