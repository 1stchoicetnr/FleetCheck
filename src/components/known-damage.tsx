"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  addKnownDamage,
  fetchKnownDamage,
  fetchPriorReports,
  updateKnownDamage,
  type KnownDamageItem,
} from "@/lib/checkout-api";
import { onFileDamage, parseReportedDamageId, type OnFileDamage } from "@/lib/on-file-damage";
import type { CheckoutReport } from "@/lib/types";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import {
  KNOWN_DAMAGE_STATUS_LABELS,
  activeKnownDamage,
  fixLaterList,
  pacificYmd,
  type KnownDamageStatus,
} from "@/lib/known-damage";
import { knownDamagePhotoSrc } from "@/lib/known-damage-photo";
import { photoAngleLabel } from "@/lib/photo-flags";
import type { PhotoAngle } from "@/lib/types";

/**
 * Office: mark a damage report as known. "Known – not fixing" or "Fix later"
 * (optional note and target date). Drivers then answer Same / New on that slot.
 */
export function MarkKnownDamage({
  vehicleId,
  angle,
  description,
  sourceReportId,
  sourceAlertId,
  onSaved,
}: {
  vehicleId: string;
  angle: PhotoAngle;
  description: string;
  sourceReportId?: string;
  sourceAlertId?: string;
  onSaved?: (item: KnownDamageItem) => void;
}) {
  const [open, setOpen] = useState<KnownDamageStatus | null>(null);
  const [text, setText] = useState(description);
  const [note, setNote] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<KnownDamageItem | null>(null);

  if (saved) {
    return (
      <p className="text-xs font-semibold text-emerald-700">
        Saved as {KNOWN_DAMAGE_STATUS_LABELS[saved.status]}
        {saved.targetDate ? ` · target ${saved.targetDate}` : ""}. Drivers will be asked Same / New on{" "}
        {photoAngleLabel(angle)}.
      </p>
    );
  }

  const save = async () => {
    if (!open) return;
    setBusy(true);
    setError("");
    try {
      const item = await addKnownDamage(vehicleId, {
        angle,
        description: text,
        status: open,
        note: note || undefined,
        targetDate: open === "fix_later" && targetDate ? targetDate : undefined,
        sourceReportId,
        sourceAlertId,
      });
      setSaved(item);
      onSaved?.(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(["not_fixing", "fix_later"] as const).map((status) => (
          <Button
            key={status}
            size="sm"
            variant={open === status ? "primary" : "outline"}
            onClick={() => setOpen(open === status ? null : status)}
          >
            {KNOWN_DAMAGE_STATUS_LABELS[status]}
          </Button>
        ))}
      </div>
      {open && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-2">
          <label className="block text-xs font-semibold text-gray-600">
            Damage ({photoAngleLabel(angle)})
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-normal"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-normal"
            />
          </label>
          {open === "fix_later" && (
            <label className="block text-xs font-semibold text-gray-600">
              Target date (optional)
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-normal"
              />
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button size="sm" className="w-full" disabled={busy || !text.trim()} onClick={() => void save()}>
            {busy ? "Saving…" : `Save as ${KNOWN_DAMAGE_STATUS_LABELS[open]}`}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Vehicle page: active known damage, Fix later list with target dates and overdue badges, Repaired. */
export function KnownDamageSection({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const [items, setItems] = useState<KnownDamageItem[] | null>(null);
  const [checks, setChecks] = useState<CheckoutReport[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const [known, recent] = await Promise.all([
        fetchKnownDamage(vehicleId),
        fetchPriorReports(vehicleId, undefined, 20).catch(() => [] as CheckoutReport[]),
      ]);
      setItems(known);
      setChecks(recent);
      setError("");
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Could not load known damage.");
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const repaired = async (id: string) => {
    setBusyId(id);
    try {
      await updateKnownDamage(vehicleId, id, { repaired: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyId("");
    }
  };

  const today = pacificYmd();
  const active = activeKnownDamage(items ?? []);
  const fixLater = fixLaterList(items ?? [], today);
  const notFixing = active.filter((item) => item.status === "not_fixing");
  const done = (items ?? []).filter((item) => item.repairedAt);
  const reported = items === null ? [] : onFileDamage(checks, items, new Date().toISOString()).filter((i) => i.source === "reported");

  const reportedRepaired = async (item: OnFileDamage) => {
    setBusyId(item.id);
    try {
      await addKnownDamage(vehicleId, {
        angle: item.angle,
        description: item.description,
        status: "not_fixing",
        sourceReportId: item.sourceReportId,
        repaired: true,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <CardTitle className="text-base">Known damage</CardTitle>
        {items === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : active.length === 0 && reported.length === 0 ? (
          <p className="text-sm text-gray-500">No known damage on this unit.</p>
        ) : null}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {reported.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Reported, not reviewed yet ({reported.length})
            </p>
            <p className="text-xs text-gray-500">
              Already posted once. Later checks that see it again are recorded here, not posted again.
            </p>
            {reported.map((item) => (
              <div key={item.id} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="text-sm font-semibold text-gray-900">
                  {photoAngleLabel(item.angle)}: {item.description}
                </p>
                <p className="text-xs text-gray-600">
                  First reported {formatCheckoutTime(item.firstReportedAt)} by {item.firstReportedBy}
                  {item.sightings > 1 && item.lastSeenAt
                    ? ` · seen on ${item.sightings} checks, last ${formatCheckoutTime(item.lastSeenAt)} by ${item.lastSeenBy}`
                    : ""}
                  {item.sourceReportId ? (
                    <>
                      {" · "}
                      <a className="underline" href={`/office/${encodeURIComponent(item.sourceReportId)}`}>
                        Open the check
                      </a>
                    </>
                  ) : null}
                </p>
                {canEdit && (
                  <>
                    <MarkKnownDamage
                      vehicleId={vehicleId}
                      angle={item.angle}
                      description={item.description}
                      sourceReportId={item.sourceReportId}
                      onSaved={() => void load()}
                    />
                    <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void reportedRepaired(item)}>
                      {busyId === item.id ? "Saving…" : "Repaired"}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {fixLater.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Fix later ({fixLater.length})
            </p>
            {fixLater.map((item) => (
              <KnownDamageRow key={item.id} item={item} overdue={item.overdue} canEdit={canEdit} busy={busyId === item.id} onRepaired={repaired} />
            ))}
          </div>
        )}
        {notFixing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Known – not fixing ({notFixing.length})
            </p>
            {notFixing.map((item) => (
              <KnownDamageRow key={item.id} item={item} canEdit={canEdit} busy={busyId === item.id} onRepaired={repaired} />
            ))}
          </div>
        )}
        {done.length > 0 && (
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer text-xs font-semibold text-gray-500">Repaired ({done.length})</summary>
            <ul className="mt-1 space-y-1">
              {done.map((item) => (
                <li key={item.id}>
                  {photoAngleLabel(item.angle)}: {item.description} · repaired {formatCheckoutTime(item.repairedAt!)}
                  {item.repairedBy ? ` by ${item.repairedBy}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function KnownDamageRow({
  item,
  overdue = false,
  canEdit,
  busy,
  onRepaired,
}: {
  item: KnownDamageItem;
  overdue?: boolean;
  canEdit: boolean;
  busy: boolean;
  onRepaired: (id: string) => void;
}) {
  const src = knownDamagePhotoSrc(item);
  return (
    <div className="flex gap-3 rounded-lg border border-gray-200 bg-white p-2">
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${photoAngleLabel(item.angle)} known damage`} className="h-16 w-20 rounded-md object-cover border border-gray-200" />
        </a>
      ) : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-gray-900">
          {photoAngleLabel(item.angle)}: {item.description}
        </p>
        <p className="text-xs text-gray-600">
          {KNOWN_DAMAGE_STATUS_LABELS[item.status]}
          {item.targetDate ? ` · target ${item.targetDate}` : ""}
          {overdue && (
            <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">Overdue</span>
          )}
        </p>
        {item.note && <p className="text-xs text-gray-600">{item.note}</p>}
        <p className="text-[11px] text-gray-400">
          {item.createdBy} · {formatCheckoutTime(item.createdAt)}
        </p>
        {canEdit && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onRepaired(item.id)}>
            {busy ? "Saving…" : "Repaired"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Check page: every slot where the driver was asked about known damage, the
 * known-damage photo next to this check's photo (even on "Same as before"),
 * the answer with driver and time, and office review buttons.
 */
export function KnownDamageAnswers({
  report,
  known,
  canReview,
  onReviewed,
}: {
  report: import("@/lib/types").CheckoutReport;
  known: KnownDamageItem[];
  canReview: boolean;
  onReviewed?: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const rows = report.photos.filter((photo) => photo.knownDamageId && photo.knownDamageAnswer);
  if (!rows.length) return null;

  const review = async (angle: string, verdict: "not_new" | "actually_new") => {
    setBusy(`${angle}:${verdict}`);
    setNote("");
    try {
      const { reviewDamageAnswer } = await import("@/lib/checkout-api");
      const result = await reviewDamageAnswer(report.id, angle, verdict);
      setNote(
        verdict === "not_new"
          ? `Marked Not new${result.alert === "archived" ? " and closed the alert" : ""}. False-report mark saved for ${report.driverName}.`
          : `Marked Actually new${result.alert === "created" ? " and added the damage alert" : ""}. Missed-damage mark saved for ${report.driverName}.`
      );
      onReviewed?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save the review.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className="border-amber-300">
      <CardContent className="py-4 space-y-3">
        <CardTitle className="text-base">Known damage check</CardTitle>
        {rows.map((photo) => {
          const reportedRef = parseReportedDamageId(photo.knownDamageId);
          const item: KnownDamageItem | undefined =
            known.find((k) => k.id === photo.knownDamageId) ??
            (reportedRef
              ? {
                  id: photo.knownDamageId!,
                  vehicleId: report.vehicleId,
                  angle: reportedRef.angle as PhotoAngle,
                  description: "Reported on an earlier check",
                  status: "not_fixing",
                  sourceReportId: reportedRef.reportId,
                  createdAt: "",
                  createdBy: "",
                }
              : undefined);
          const knownSrc = item ? knownDamagePhotoSrc(item) : "";
          const same = photo.knownDamageAnswer === "same";
          const reviewed = photo.damageReview;
          return (
            <div key={photo.angle} className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">
                {photoAngleLabel(photo.angle)}
                {item ? `: ${item.description}` : ""}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <PhotoBox src={knownSrc} caption={item ? (item.createdAt ? `Known · ${formatCheckoutTime(item.createdAt)}` : "Earlier report") : "Known damage (removed)"} />
                <PhotoBox src={photo.dataUrl} caption={`This check · ${report.driverName}`} />
              </div>
              <p className={`text-sm font-semibold ${same ? "text-gray-700" : "text-red-700"}`}>
                Driver said: {same ? "Same as before" : "New damage"} · {report.driverName}
                {photo.knownDamageAnsweredAt ? ` · ${formatCheckoutTime(photo.knownDamageAnsweredAt)}` : ""}
              </p>
              {reviewed ? (
                <p className="text-xs font-semibold text-amber-800">
                  {reviewed.kind === "false_report" ? "Office: Not new (false report)" : "Office: Actually new (missed damage)"} ·{" "}
                  {reviewed.by} · {formatCheckoutTime(reviewed.at)}
                </p>
              ) : canReview ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={Boolean(busy)}
                  onClick={() => void review(photo.angle, same ? "actually_new" : "not_new")}
                >
                  {same ? "Actually new" : "Not new"}
                </Button>
              ) : null}
            </div>
          );
        })}
        {note && <p className="text-xs text-gray-700">{note}</p>}
      </CardContent>
    </Card>
  );
}

function PhotoBox({ src, caption }: { src?: string; caption: string }) {
  return (
    <figure className="min-w-0">
      <div className="aspect-video overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {src ? (
          <a href={src} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={caption} className="h-full w-full object-cover" loading="lazy" />
          </a>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">No photo</div>
        )}
      </div>
      <figcaption className="mt-0.5 truncate text-[11px] text-gray-500">{caption}</figcaption>
    </figure>
  );
}
