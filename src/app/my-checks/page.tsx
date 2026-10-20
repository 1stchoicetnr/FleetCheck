"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { DeliveryBadge } from "@/components/delivery-badge";
import { useAuth } from "@/hooks/use-auth";
import { fetchMyChecks } from "@/lib/checkout-api";
import {
  getCheckoutReports,
  listCheckoutOutbox,
} from "@/lib/storage";
import type { CheckoutReport } from "@/lib/types";
import { formatUnitLabel } from "@/lib/utils";

interface CheckRow {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  sentAt?: string;
  localOnly?: boolean;
}

export default function MyChecksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [ready, setReady] = useState(false);

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
      for (const item of outbox) {
        byId.set(item.serverReportId || item.id, {
          id: item.serverReportId || item.id,
          title: formatUnitLabel(item.unitNumber, item.plate),
          detail: `${item.year} ${item.make} ${item.model}`,
          createdAt: item.createdAt,
          localOnly: !item.serverReportId,
        });
      }
      for (const report of local) {
        if (byId.has(report.id)) continue;
        byId.set(report.id, {
          id: report.id,
          title: formatUnitLabel(report.unitNumber, report.plate),
          detail: `${report.year} ${report.make} ${report.model}`,
          createdAt: report.createdAt,
          sentAt: report.sentAt || report.completedAt,
        });
      }
      for (const report of remote) {
        byId.set(report.id, {
          id: report.id,
          title: formatUnitLabel(report.unitNumber, report.plate),
          detail: `${report.year} ${report.make} ${report.model}`,
          createdAt: report.createdAt,
          sentAt: report.sentAt,
        });
      }
      const next = Array.from(byId.values()).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
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
  }, [user]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="My recent checks" backHref="/dashboard" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        <p className="text-sm text-gray-600">
          Each check is saved on this phone, then uploaded, then marked sent.
        </p>
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
                sentAt={row.sentAt}
                localOnly={row.localOnly}
              />
            </div>
          </div>
        ))}
        <Link href="/checkout" className="block text-center text-sm font-semibold text-brand-700 underline">
          Start a checkout report
        </Link>
      </div>
    </div>
  );
}
