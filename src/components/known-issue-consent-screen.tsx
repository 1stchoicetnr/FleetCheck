"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Vehicle, CheckType } from "@/lib/types";

interface KnownIssueConsentScreenProps {
  vehicle: Vehicle;
  checkType: CheckType;
  issueText: string;
  onConsent: () => void;
  onCancel: () => void;
}

export function KnownIssueConsentScreen({
  vehicle,
  checkType,
  issueText,
  onConsent,
  onCancel,
}: KnownIssueConsentScreenProps) {
  return (
    <div className="min-h-[60vh] flex flex-col justify-center space-y-6 py-4">
      <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-200 p-2 flex-shrink-0">
            <AlertTriangle className="h-6 w-6 text-amber-800" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-amber-950">Known Issue</h2>
            <p className="text-sm text-amber-900 mt-1">
              {vehicle.plate} — {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
            <p className="text-xs text-amber-800 mt-2 uppercase tracking-wide font-semibold">
              {checkType === "check_in" ? "Before Check In" : "Before Check Out"}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-amber-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Issue reported by fleet staff
          </p>
          <p className="text-base text-gray-900 leading-relaxed">{issueText}</p>
        </div>

        <p className="text-sm text-amber-900">
          You must read and acknowledge this issue before continuing.
        </p>
      </div>

      <Button size="xl" className="w-full" onClick={onConsent}>
        I understand and consent to drive this vehicle
      </Button>
      <Button size="lg" variant="secondary" className="w-full" onClick={onCancel}>
        Go Back
      </Button>
    </div>
  );
}
