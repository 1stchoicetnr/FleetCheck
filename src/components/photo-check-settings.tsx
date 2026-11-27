"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPhotoCheckStatus, saveCompanySettings, type PhotoCheckStatus } from "@/lib/checkout-api";
import { PHOTO_CHECK_CAP_MAX_USD } from "@/lib/photo-check";

/** Owner setting: bot photo check on/off and the monthly spend cap. Off by default. */
export function PhotoCheckSettingsCard() {
  const [status, setStatus] = useState<PhotoCheckStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cap, setCap] = useState("10");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchPhotoCheckStatus()
      .then((s) => {
        setStatus(s);
        setEnabled(s.settings.enabled);
        setCap(String(s.settings.monthlyCapUsd));
      })
      .catch(() => setMessage("Photo check status could not be loaded."));
  }, []);

  async function save() {
    const monthlyCapUsd = Number(cap);
    if (!Number.isFinite(monthlyCapUsd) || monthlyCapUsd < 0 || monthlyCapUsd > PHOTO_CHECK_CAP_MAX_USD) {
      setMessage(`Cap must be $0 to $${PHOTO_CHECK_CAP_MAX_USD}.`);
      return;
    }
    try {
      const next = await saveCompanySettings({ photoCheck: { enabled, monthlyCapUsd } });
      setEnabled(next.photoCheck.enabled);
      setCap(String(next.photoCheck.monthlyCapUsd));
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save.");
    }
  }

  if (!status) return message ? <p className="text-sm text-red-600">{message}</p> : null;
  return (
    <Card>
      <CardContent className="py-5 space-y-3">
        <CardTitle>Bot photo check</CardTitle>
        <p className="text-sm text-gray-600">
          After each check, a vision model ({status.model}, through Vercel AI Gateway) compares each outside
          photo with the unit&apos;s last clean or known-damage photo. Likely new damage goes to the office
          Alerts queue only, as &quot;Found by photo check&quot;, with Confirm new damage, Already known, or Dismiss.
          Confirm adds Rad Cab damage to the daily repair digest. Already known and Dismiss send nothing.
        </p>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
          <span className="text-sm font-medium">Turn on photo check</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" />
        </label>
        <label className="block text-sm font-medium">
          Monthly cap (USD)
          <input
            inputMode="decimal"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-xs text-gray-500">
          This month: ${status.spend.toFixed(2)} across {status.calls} photo{status.calls === 1 ? "" : "s"}. Checks stop
          for the rest of the month at the cap.
        </p>
        {!status.gatewayConfigured && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No AI Gateway credential found on this server. On Vercel it uses the project&apos;s OIDC token
            automatically once AI Gateway credits are set up for the team.
          </p>
        )}
        <Button type="button" onClick={() => void save()}>Save photo check</Button>
        {message && <p className="text-sm text-gray-700">{message}</p>}
      </CardContent>
    </Card>
  );
}
