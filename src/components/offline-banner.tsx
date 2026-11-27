"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { usePendingSync } from "@/hooks/use-offline";
import { outboxHeadline, outboxLines } from "@/lib/outbox-summary";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { count, items, retry, retrying, online, clear } = usePendingSync();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const [clearError, setClearError] = useState("");

  if (online && count === 0) return null;

  const waiting = count > 0;
  const signedIn = Boolean(user) || loading;
  const lines = outboxLines(items, { signedIn, role: user?.role });
  const needsSignIn = waiting && !signedIn;
  const yesterdayOnly = lines.length > 0 && lines.every((line) => line.previousDayNote);

  async function onClear(id: string, label: string) {
    const ok = window.confirm(
      `Clear ${label} from this phone?\n\nPhotos that did not upload will be lost. Anything already on the server stays.`
    );
    if (!ok) return;
    setClearing(id);
    setClearError("");
    try {
      await clear(id);
    } catch (err) {
      setClearError(err instanceof Error ? err.message : "Could not clear this check.");
    } finally {
      setClearing(null);
    }
  }

  return (
    <div
      className={`px-4 py-3 text-sm font-medium ${
        waiting ? "bg-amber-100 text-amber-950" : "bg-orange-50 text-orange-800"
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        {!online && <WifiOff className="h-4 w-4" />}
        <p>
          {waiting
            ? needsSignIn
              ? "Sign in to finish uploading."
              : outboxHeadline(lines, online)
            : "Offline — checks and photos stay on this phone."}
        </p>
        {waiting && needsSignIn && (
          <Link
            href="/"
            className="min-h-10 inline-flex items-center rounded-lg bg-amber-700 px-3 text-sm font-bold text-white"
          >
            Sign in
          </Link>
        )}
        {waiting && !needsSignIn && (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying || !online}
            className="min-h-10 rounded-lg bg-amber-700 px-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {retrying ? "Retrying…" : yesterdayOnly && online ? "Finish sending" : "Retry"}
          </button>
        )}
        {waiting && lines.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="min-h-10 rounded-lg border border-amber-700 px-3 text-sm font-semibold text-amber-900"
            aria-expanded={open}
          >
            {open ? "Hide details" : "Details"}
          </button>
        )}
      </div>
      {waiting && open && lines.length > 0 && (
        <ul className="mx-auto mt-3 max-w-xl space-y-2 text-left">
          {lines.map((line) => (
            <li key={line.id} className="rounded-lg bg-white/70 px-3 py-2 text-amber-950">
              <div className="font-semibold">
                {line.unit} · {line.driver} · {line.when}
              </div>
              <div className="text-xs">{line.problem}</div>
              {line.previousDayNote && line.previousDayNote !== line.problem && (
                <div className="text-xs">{line.previousDayNote}</div>
              )}
              {line.fixHref && (
                <Link
                  href={line.fixHref}
                  className="mt-2 mr-2 inline-flex min-h-9 items-center rounded-md bg-amber-800 px-2 text-xs font-bold text-white"
                >
                  Fix this check
                </Link>
              )}
              {line.canClear && (
                <button
                  type="button"
                  onClick={() => void onClear(line.id, `${line.unit} (${line.driver}, ${line.when})`)}
                  disabled={clearing === line.id}
                  className="mt-2 min-h-9 rounded-md border border-red-700 px-2 text-xs font-bold text-red-800 disabled:opacity-60"
                >
                  {clearing === line.id ? "Clearing…" : "Clear this check"}
                </button>
              )}
            </li>
          ))}
          {clearError && <li className="text-xs font-semibold text-red-800">{clearError}</li>}
        </ul>
      )}
    </div>
  );
}
