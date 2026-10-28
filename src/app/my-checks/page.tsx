"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { DeliveryBadge } from "@/components/delivery-badge";
import { useAuth } from "@/hooks/use-auth";
import { fetchMyChecks, markCheckoutSent } from "@/lib/checkout-api";
import { driverUploadMessage } from "@/lib/delivery-status";
import { retryCheckoutOutbox } from "@/lib/checkout-outbox";
import {
  getCheckoutReports,
  listCheckoutOutbox,
} from "@/lib/storage";
import type { CheckoutReport } from "@/lib/types";
import { isBeforeRolloutSlate } from "@/lib/rollout-slate";
import { formatUnitLabel } from "@/lib/utils";

interface CheckRow {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  sentAt?: string;
  localOnly?: boolean;
  unfinished?: boolean;
  archivedAt?: string;
}

export default function MyChecksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState("");
  const [finishNote, setFinishNote] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const [outbox, local] = await Promise.all([
        listCheckoutOutbox(),
        getCheckoutReports(),
      ]);
      let remote: CheckoutReport[] = [];
      try {
        remote = await fetchMyChecks();
      } catch {
        remote = [];
      }
      const byId = new Map<string, CheckRow>();
      const waitingIds = new Set<string>();
      for (const item of outbox) {
        waitingIds.add(item.id);
        if (item.serverReportId) waitingIds.add(item.serverReportId);
        byId.set(item.serverReportId || item.id, {
          id: item.serverReportId || item.id,
          title: formatUnitLabel(item.unitNumber, item.plate),
          detail: `${item.year} ${item.make} ${item.model}`,
          createdAt: item.createdAt,
          localOnly: !item.serverReportId,
          unfinished: true,
        });
      }
      for (const report of local) {
        if (byId.has(report.id)) continue;
        byId.set(report.id, {
          id: report.id,
          title: formatUnitLabel(report.unitNumber, report.plate),
          detail: `${report.year} ${report.make} ${report.model}`,
          createdAt: report.createdAt,
          sentAt: report.sentAt,
          archivedAt: report.archivedAt,
        });
      }
      for (const report of remote) {
        if (waitingIds.has(report.id)) continue;
        byId.set(report.id, {
          id: report.id,
          title: formatUnitLabel(report.unitNumber, report.plate),
          detail: `${report.year} ${report.make} ${report.model}`,
          createdAt: report.createdAt,
          sentAt: report.sentAt,
        });
      }
      const remoteIds = new Set(remote.map((report) => report.id));
      const next = Array.from(byId.values())
        .filter((row) => {
          if (row.archivedAt) return false;
          if (remoteIds.has(row.id)) return true;
          return !isBeforeRolloutSlate(row.createdAt);
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      if (!cancelled) {
        setRows(next);
        setReady(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, reload]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="My recent checks" backHref="/dashboard" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        <p className="text-sm text-gray-600">
          Each check is saved on this phone, then uploaded, then marked sent.
          Finish sending keeps trying without changing the check.
        </p>
        {finishNote && (
          <p className="text-sm font-semibold text-gray-800" role="status">
            {finishNote}
          </p>
        )}
        {ready && rows.length === 0 && (
          <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-200 p-4">
            No checks yet. Start a checkout report and it will show up here.
          </p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{row.title}</p>
                <p className="text-sm text-gray-600">{row.detail}</p>
              </div>
              <DeliveryBadge
                createdAt={row.createdAt}
                sentAt={row.unfinished ? undefined : row.sentAt}
                localOnly={row.localOnly}
                unfinished={row.unfinished}
              />
            </div>
            {(row.unfinished || !row.sentAt) && (
              <button
                type="button"
                className="mt-3 w-full min-h-[44px] rounded-xl bg-accent text-sm font-semibold text-[#052e16]"
                disabled={finishing === row.id}
                onClick={() => {
                  setFinishing(row.id);
                  setFinishNote("");
                  const run = row.unfinished
                    ? retryCheckoutOutbox().then(() => undefined)
                    : markCheckoutSent(row.id).then(() => undefined);
                  void run
                    .then(() => {
                      setFinishNote("Trying again. Stay on this page until it says Sent.");
                      setReload((value) => value + 1);
                    })
                    .catch((err: Error) => {
                      setFinishNote(driverUploadMessage(err.message || "Could not finish sending."));
                    })
                    .finally(() => setFinishing(""));
                }}
              >
                {finishing === row.id ? "Sending…" : "Finish sending"}
              </button>
            )}
          </div>
        ))}
        <Link href="/checkout" className="block text-center text-sm font-semibold text-brand-700 underline">
          Start a checkout report
        </Link>
      </div>
    </div>
  );
}
