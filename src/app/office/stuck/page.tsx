"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { OfficePinGate } from "@/components/office-pin-gate";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout } from "@/lib/fleet-config";
import { fetchStuckChecks } from "@/lib/checkout-api";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import type { StuckCheckRow } from "@/lib/stuck-checks";

export default function OfficeStuckChecksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stuck, setStuck] = useState<StuckCheckRow[]>([]);
  const [withoutPhotos, setWithoutPhotos] = useState<StuckCheckRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [officeReady, setOfficeReady] = useState(false);
  const markOfficeUnlocked = useCallback(() => setOfficeReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  const load = useCallback(() => {
    setReady(false);
    fetchStuckChecks()
      .then((data) => {
        setStuck(data.stuck);
        setWithoutPhotos(data.sentWithoutPhotos);
        setError("");
      })
      .catch((err: Error) => setError(err.message || "Could not load stuck checks."))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!officeReady) return;
    load();
  }, [officeReady, load]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Office — Stuck checks" backHref="/office" />
      <OfficePinGate onUnlocked={markOfficeUnlocked}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Stuck checks</h2>
            <p className="text-sm text-gray-500">
              Last 14 days. Read-only. Checks that never reached &quot;sent&quot;, and checks sent
              without their photos. A check still sitting on a phone that never reached the
              server is not listed here; it shows in that phone&apos;s upload banner.
            </p>
            <div className="mt-1 flex gap-3">
              <Link href="/office" className="text-xs font-semibold text-brand-700 underline underline-offset-2">
                Back to checkout reports
              </Link>
              <button
                type="button"
                onClick={load}
                className="text-xs font-semibold text-brand-700 underline underline-offset-2"
              >
                Refresh
              </button>
            </div>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <Section
            title="Not sent"
            empty="Nothing stuck."
            rows={stuck}
            ready={ready}
          />
          <Section
            title="Sent without photos"
            empty="No checks were sent without photos."
            rows={withoutPhotos}
            ready={ready}
          />
        </div>
      </OfficePinGate>
    </div>
  );
}

function Section({
  title,
  empty,
  rows,
  ready,
}: {
  title: string;
  empty: string;
  rows: StuckCheckRow[];
  ready: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">
        {title} {ready ? `(${rows.length})` : ""}
      </h3>
      {!ready && <p className="text-sm text-gray-500">Loading…</p>}
      {ready && rows.length === 0 && <p className="text-sm text-gray-500">{empty}</p>}
      {rows.map((row) => (
        <Card key={row.id}>
          <CardContent className="p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/office/${row.id}`} className="font-semibold text-brand-700 underline underline-offset-2">
                Unit {row.unit.startsWith("#") ? row.unit : `#${row.unit}`} · {row.driver}
              </Link>
              <span className="text-xs text-gray-500">{formatCheckoutTime(row.completedAt)}</span>
            </div>
            <div className="mt-1 text-gray-800">{row.reason}</div>
            <div className="mt-1 text-xs text-gray-500">
              {row.sentAt
                ? `Sent ${formatCheckoutTime(row.sentAt)}`
                : `Waiting ${row.hoursWaiting} h`}
              {" · "}
              <span className="font-mono">{row.id}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
