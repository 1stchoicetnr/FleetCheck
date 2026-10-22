"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { verifyOfficePinRemote } from "@/lib/checkout-api";
import { isOfficeUnlocked, unlockOffice } from "@/lib/office-auth";
import { Lock } from "lucide-react";

export function OfficePinGate({
  children,
  onUnlocked,
}: {
  children: ReactNode;
  onUnlocked?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function openGate() {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { user?: { roleTitle?: string } | null };
          const title = data.user?.roleTitle;
          if (
            !cancelled &&
            (title === "Owner" || title === "Manager" || title === "Office")
          ) {
            setUnlocked(true);
            setReady(true);
            onUnlocked?.();
            return;
          }
        }
      } catch {
        // Fall through to the PIN. Demo roles still use it.
      }
      if (cancelled) return;
      const open = isOfficeUnlocked();
      setUnlocked(open);
      setReady(true);
      if (open) onUnlocked?.();
    }
    void openGate();
    return () => {
      cancelled = true;
    };
  }, [onUnlocked]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError("");
    const result = await verifyOfficePinRemote(pin);
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    unlockOffice(pin);
    setUnlocked(true);
    onUnlocked?.();
    const next = new URLSearchParams(window.location.search).get("next");
        if (next && /^\/(admin|alerts|reports|vehicles|office|settings)(\/|$)/.test(next)) {
          window.location.assign(next);
        }
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="animate-pulse text-brand-600 font-semibold">Loading…</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Office unlock</h2>
              <p className="text-sm text-gray-500">
                Enter the office PIN to review shared checkout reports.
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Office PIN"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              error={error}
            />
            <Button type="submit" size="xl" className="w-full" disabled={checking}>
              {checking ? "Checking…" : "Unlock office"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
