"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { OfficePinGate } from "@/components/office-pin-gate";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout } from "@/lib/fleet-config";
import { fetchAppFeedback } from "@/lib/checkout-api";
import {
  feedbackRoleLabel,
  feedbackStepLabel,
  StoredFeedback,
} from "@/lib/feedback";
import { formatDate, formatUnitLabel } from "@/lib/utils";

export default function OfficeFeedbackPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<StoredFeedback[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [officeReady, setOfficeReady] = useState(false);
  const markOfficeUnlocked = useCallback(() => setOfficeReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  const load = useCallback(() => {
    fetchAppFeedback()
      .then((list) => {
        setRows(list);
        setError("");
      })
      .catch((err: Error) => setError(err.message || "Could not load feedback."))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!officeReady) return;
    load();
  }, [officeReady, load]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Office — App feedback" backHref="/office" />
      <OfficePinGate onUnlocked={markOfficeUnlocked}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">App feedback</h2>
            <p className="text-sm text-gray-500">
              {ready ? `${rows.length} saved` : "Loading feedback…"} Bugs, glitches, and ideas from the checkout Feedback button.
            </p>
            <Link
              href="/office"
              className="text-xs font-semibold text-brand-700 underline underline-offset-2"
            >
              Back to checkout reports
            </Link>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          {ready && rows.length === 0 && !error && (
            <p className="text-sm text-gray-500">No app feedback yet.</p>
          )}
          {rows.map((row) => (
            <FeedbackCard key={row.id} row={row} />
          ))}
        </div>
      </OfficePinGate>
    </div>
  );
}

function FeedbackCard({ row }: { row: StoredFeedback }) {
  const who = row.userName?.trim() || row.driverName?.trim() || "Unknown";
  const page = feedbackStepLabel(row.photoStep, row.pagePhase) || row.pagePhase || "—";
  const unit =
    row.unitNumber || row.plate
      ? formatUnitLabel(row.unitNumber || "", row.plate)
      : "";
  const via =
    row.deliveredVia === "slack"
      ? "Sent to Slack"
      : row.deliveredVia === "email"
        ? "Emailed"
        : "Office only";
  return (
    <Card>
      <CardContent className="py-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900">
            {row.type}
            {unit ? ` · ${unit}` : ""}
          </p>
          <span className="text-xs font-semibold text-gray-500">{via}</span>
        </div>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {row.note?.trim() || "(no note)"}
        </p>
        <p className="text-xs text-gray-500">
          {who} · {feedbackRoleLabel(row.userRole)} · {page} · {formatDate(row.createdAt)}
        </p>
        {row.pageUrl && (
          <p className="text-xs text-gray-400 break-all">{row.pageUrl}</p>
        )}
        {row.screenshotUrl && (
          <a href={row.screenshotUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.screenshotUrl}
              alt="Feedback screenshot"
              className="mt-1 h-28 w-28 rounded-lg object-cover border border-gray-200"
            />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
