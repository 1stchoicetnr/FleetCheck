/** Fields the create route refuses to store a checkout without. */
export interface CheckoutCreateFields {
  companyId?: unknown;
  vehicleId?: unknown;
  unitNumber?: unknown;
  make?: unknown;
  model?: unknown;
  driverName?: unknown;
  dispatcherName?: unknown;
  year?: unknown;
  odometer?: unknown;
}

const REQUIRED: Array<{ key: keyof CheckoutCreateFields; label: string; numeric?: boolean }> = [
  { key: "companyId", label: "company" },
  { key: "vehicleId", label: "unit" },
  { key: "unitNumber", label: "unit number" },
  { key: "make", label: "make" },
  { key: "model", label: "model" },
  { key: "driverName", label: "driver name" },
  { key: "dispatcherName", label: "dispatcher" },
  { key: "year", label: "year", numeric: true },
  { key: "odometer", label: "odometer", numeric: true },
];

function fieldPresent(value: unknown, numeric: boolean): boolean {
  if (numeric) {
    if (value == null || value === "") return false;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n);
  }
  if (typeof value === "string") return value.trim().length > 0;
  return value != null && value !== false;
}

/** Human labels for create fields the server would reject. Empty when the body is complete. */
export function missingCheckoutFieldLabels(body: CheckoutCreateFields): string[] {
  return REQUIRED.filter((field) => !fieldPresent(body[field.key], Boolean(field.numeric))).map(
    (field) => field.label
  );
}

export interface PresentCheckoutCreateFields {
  companyId: string;
  vehicleId: string;
  unitNumber: string;
  make: string;
  model: string;
  driverName: string;
  dispatcherName: string;
  year: number;
  odometer: number;
}

/** The required create fields, or null when any of them is missing. */
export function readCheckoutCreateFields(
  body: CheckoutCreateFields
): PresentCheckoutCreateFields | null {
  if (missingCheckoutFieldLabels(body).length > 0) return null;
  return {
    companyId: String(body.companyId).trim(),
    vehicleId: String(body.vehicleId).trim(),
    unitNumber: String(body.unitNumber).trim(),
    make: String(body.make).trim(),
    model: String(body.model).trim(),
    driverName: String(body.driverName).trim(),
    dispatcherName: String(body.dispatcherName).trim(),
    year: Number(body.year),
    odometer: Number(body.odometer),
  };
}

/** Stored on the outbox item so the phone can say which fields to fix. */
export function missingCheckoutFieldsError(labels: string[]): string {
  return labels.length > 0
    ? `Missing required checkout fields: ${labels.join(", ")}`
    : "Missing required checkout fields";
}

/**
 * Driver-facing copy for a validation refusal. Null when this error is not
 * something the driver can fix on the check.
 */
export function notSentValidationMessage(message: string | undefined): string | null {
  const text = (message ?? "").trim();
  if (!text) return null;
  const missing = /^Missing required checkout fields(?::\s*(.*))?$/i.exec(text);
  if (missing) {
    const labels = (missing[1] || "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    const what = labels.length > 0 ? labels.join(", ") : "a required field";
    const them = labels.length === 1 ? "it" : "those";
    return `Not sent. Here's what's missing: ${what}. Open the check and fill ${them} in.`;
  }
  if (/signature/i.test(text)) {
    return "Not sent. Here's what's missing: the signature. Open the check and sign it.";
  }
  return null;
}

/** True when the driver should open the check and fix it, not just tap Retry. */
export function isDriverFixableOutboxError(message: string | undefined): boolean {
  if (notSentValidationMessage(message)) return true;
  return (message ?? "").startsWith("Not sent. Here's what's missing");
}
