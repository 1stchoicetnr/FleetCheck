"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OfficePinGate } from "@/components/office-pin-gate";
import { useAuth } from "@/hooks/use-auth";
import { canManageOfficeRecords, canReviewCheckout } from "@/lib/fleet-config";
import { fetchSpotCheck, reviewDamageAnswer, type SpotCheckItem } from "@/lib/checkout-api";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { knownDamagePhotoSrc } from "@/lib/known-damage-photo";
import { photoAngleLabel } from "@/lib/photo-flags";
import type { PhotoAngle } from "@/lib/types";

/** Weekly spot check: a few random "Same as before" answers, known photo next to the driver's. */
export default function SpotCheckPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SpotCheckItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [officeReady, setOfficeReady] = useState(false);
  const [busy, setBusy] = useState("");
  const markOfficeUnlocked = useCallback(() => setOfficeReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  const load = useCallback(() => {
    fetchSpotCheck()
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setError("");
      })
      .catch((err: Error) => {
        setItems([]);
        setError(err.message || "Could not load the spot check.");
      });
  }, []);

  useEffect(() => {
    if (officeReady) load();
  }, [officeReady, load]);

  if (loading || !user) return null;
  const canReview = canManageOfficeRecords(user.role);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Office — Spot check" backHref="/alerts" />
      <OfficePinGate onUnlocked={markOfficeUnlocked}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Weekly spot check</h2>
            <p className="text-sm text-gray-500">
              Up to 5 random &quot;Same as before&quot; answers from the past 7 days
              {total ? ` (of ${total})` : ""}. Same list all week. If one is really new damage, tap Actually new.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {items === null ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500">No &quot;Same as before&quot; answers this week.</p>
          ) : (
            items.map((item) => {
              const knownSrc = item.known ? knownDamagePhotoSrc(item.known) : "";
              return (
                <Card key={item.key}>
                  <CardContent className="py-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {item.unitNumber || item.plate} · {photoAngleLabel(item.angle as PhotoAngle)}
                      {item.known ? `: ${item.known.description}` : ""}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { src: knownSrc, caption: item.known ? `Known · ${formatCheckoutTime(item.known.createdAt)}` : "Known damage (removed)" },
                        { src: item.photoSrc, caption: `${item.driverName} · ${formatCheckoutTime(item.completedAt)}` },
                      ].map((cell) => (
                        <figure key={cell.caption} className="min-w-0">
                          <div className="aspect-video overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                            {cell.src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cell.src} alt={cell.caption} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-gray-400">No photo</div>
                            )}
                          </div>
                          <figcaption className="mt-0.5 truncate text-[11px] text-gray-500">{cell.caption}</figcaption>
                        </figure>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/office/${encodeURIComponent(item.reportId)}`} className="flex-1">
                        <Button size="sm" variant="outline" className="w-full">Open check</Button>
                      </Link>
                      {canReview && !item.reviewKind && (
                        <Button
                          size="sm"
                          variant="danger"
                          className="flex-1"
                          disabled={busy === item.key}
                          onClick={() => {
                            setBusy(item.key);
                            reviewDamageAnswer(item.reportId, item.angle, "actually_new")
                              .then(load)
                              .catch((err: Error) => setError(err.message))
                              .finally(() => setBusy(""));
                          }}
                        >
                          Actually new
                        </Button>
                      )}
                      {item.reviewKind === "missed_damage" && (
                        <span className="flex-1 text-xs font-semibold text-amber-800 self-center">Marked actually new</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </OfficePinGate>
    </div>
  );
}
