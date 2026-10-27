"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { OfficePinGate } from "@/components/office-pin-gate";
import {
  LightboxPhoto,
  OfficePhotoThumb,
  PhotoLightbox,
} from "@/components/photo-lightbox";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout } from "@/lib/fleet-config";
import { fetchCheckoutReport, fetchCompanySettings } from "@/lib/checkout-api";
import { getChecklistForCompany } from "@/lib/companies";
import { photoStepsForCompany, type PublicCompanySettings } from "@/lib/company-settings";
import {
  CheckoutReport,
  photoStepsForReport,
} from "@/lib/types";
import { formatUnitLabel } from "@/lib/utils";
import {
  damageFlagText,
  isPhotoDamageFlagged,
  photoAngleLabel,
  sortAnglesDamageFirst,
} from "@/lib/photo-flags";

export default function CheckoutPhotoGalleryPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const reportId = params.id as string;
  const [report, setReport] = useState<CheckoutReport | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [officeReady, setOfficeReady] = useState(false);
  const [settings, setSettings] = useState<PublicCompanySettings | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/?next=${encodeURIComponent(`/office/${reportId}/photos`)}`);
      return;
    }
    if (!canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router, reportId]);

  useEffect(() => {
    if (!officeReady) return;
    let cancelled = false;
    Promise.all([
      fetchCheckoutReport(reportId),
      fetchCompanySettings().catch(() => null),
    ])
      .then(([found, companySettings]) => {
        if (cancelled) return;
        setReport(found);
        setSettings(companySettings);
        if (!found) setError("Report not found.");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load photos.");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [officeReady, reportId]);

  const steps = useMemo(() => {
    const base = settings
      ? photoStepsForCompany(settings, report?.companyId)
      : getChecklistForCompany(null);
    return sortAnglesDamageFirst(
      photoStepsForReport(base, report?.photos ?? []),
      report?.photos ?? []
    );
  }, [settings, report]);

  const photos = useMemo<LightboxPhoto[]>(() => {
    if (!report) return [];
    const byAngle = new Map(report.photos.map((photo) => [photo.angle, photo]));
    const labeled = steps.flatMap((step) => {
      const photo = byAngle.get(step.angle);
      if (!photo?.dataUrl) return [];
      const damage = isPhotoDamageFlagged(photo);
      return [{
        id: step.angle,
        src: photo.dataUrl,
        label: damage ? damageFlagText(photo, report.driverName) : step.label,
      }];
    });
    const listed = new Set(labeled.map((item) => item.id));
    for (const photo of report.photos) {
      if (!photo.dataUrl || listed.has(photo.angle)) continue;
      const damage = isPhotoDamageFlagged(photo);
      labeled.push({
        id: photo.angle,
        src: photo.dataUrl,
        label: damage
          ? damageFlagText(photo, report.driverName)
          : photoAngleLabel(photo.angle),
      });
    }
    return labeled;
  }, [report, steps]);

  if (loading || !user || !canReviewCheckout(user.role)) return null;

  const title = report
    ? `${formatUnitLabel(report.unitNumber, report.plate)} photos`
    : "Photos";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title={title} backHref={`/office/${reportId}`} />
      <OfficePinGate onUnlocked={() => setOfficeReady(true)}>
        {!ready ? (
          <p className="text-center text-brand-600 py-12 font-semibold">Loading…</p>
        ) : !report ? (
          <p className="text-center text-red-600 py-12">{error || "Report not found."}</p>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-gray-600">
                {report.driverName.trim() || "Driver"} · {photos.length} photo{photos.length === 1 ? "" : "s"}
              </p>
              <Link href={`/office/${reportId}`} className="text-sm font-semibold text-brand-700">
                Open the check
              </Link>
            </div>
            {photos.length === 0 ? (
              <p className="text-center text-gray-500 py-12">No photos on this check.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, index) => {
                  const source = report.photos.find((item) => item.angle === photo.id);
                  const damaged = isPhotoDamageFlagged(source);
                  return (
                    <div
                      key={photo.id}
                      className={`rounded-xl border bg-white overflow-hidden ${
                        damaged ? "border-red-400 ring-2 ring-red-200" : "border-gray-200"
                      }`}
                    >
                      <div className="aspect-video bg-gray-100">
                        <OfficePhotoThumb
                          src={photo.src}
                          label={photo.label}
                          onOpen={() => setLightboxIndex(index)}
                        />
                      </div>
                      <p className="px-2 py-1.5 text-xs font-semibold text-gray-700">{photo.label}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <PhotoLightbox
              photos={photos}
              index={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onIndexChange={setLightboxIndex}
            />
          </div>
        )}
      </OfficePinGate>
    </div>
  );
}
