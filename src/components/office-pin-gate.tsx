"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { getSettings } from "@/lib/storage";
import { DEFAULT_OFFICE_PIN } from "@/lib/companies";
import {
  isOfficeUnlocked,
  unlockOffice,
  verifyOfficePin,
} from "@/lib/office-auth";
import { Lock } from "lucide-react";

export function OfficePinGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [expected, setExpected] = useState(DEFAULT_OFFICE_PIN);
  const [error, setError] = useState("");

  useEffect(() => {
    getSettings().then((settings) => {
      setExpected(settings.officePin || DEFAULT_OFFICE_PIN);
      setUnlocked(isOfficeUnlocked());
      setReady(true);
    });
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!verifyOfficePin(pin, expected)) {
      setError("Incorrect PIN. Try again.");
      return;
    }
    unlockOffice();
    setUnlocked(true);
    setError("");
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
                Enter the office PIN to review checkout reports.
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
              hint="Demo PIN is 1357"
            />
            <Button type="submit" size="xl" className="w-full">
              Unlock office
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
