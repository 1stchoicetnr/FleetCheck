import { Vehicle, VehicleKnownIssue, CheckType, KnownIssueConsent } from "./types";

export function hasOpenKnownIssue(vehicle: Vehicle): boolean {
  return !!(
    vehicle.knownIssue?.isOpen &&
    vehicle.knownIssue.text.trim().length > 0
  );
}

export function formatKnownIssueSummary(issue: VehicleKnownIssue): string {
  return issue.text.trim();
}

export const KNOWN_ISSUE_CONSENT_KEY = "fleetcheck-known-issue-consent";

interface StoredConsent {
  vehicleId: string;
  checkType: CheckType;
  consent: KnownIssueConsent;
}

export function storeKnownIssueConsent(
  vehicleId: string,
  checkType: CheckType,
  consent: KnownIssueConsent
) {
  if (typeof window === "undefined") return;
  const payload: StoredConsent = { vehicleId, checkType, consent };
  sessionStorage.setItem(KNOWN_ISSUE_CONSENT_KEY, JSON.stringify(payload));
}

export function peekKnownIssueConsent(
  vehicleId: string,
  checkType: CheckType
): KnownIssueConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KNOWN_ISSUE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.vehicleId === vehicleId && parsed.checkType === checkType) {
      return parsed.consent;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function consumeKnownIssueConsent(
  vehicleId: string,
  checkType: CheckType
): KnownIssueConsent | null {
  const consent = peekKnownIssueConsent(vehicleId, checkType);
  if (consent && typeof window !== "undefined") {
    sessionStorage.removeItem(KNOWN_ISSUE_CONSENT_KEY);
  }
  return consent;
}

export function clearKnownIssueConsent() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(KNOWN_ISSUE_CONSENT_KEY);
  }
}
