function normalizePlate(plate: string): string {
  return plate.replace(/[\s-]/g, "").toUpperCase();
}

/** Plates that only exist as on-device examples. Never copy these onto the server. */
export const DEMO_LOCAL_PLATES = [
  "ABC1234",
  "TOW5678",
  "TUR9012",
  "SVC3456",
  "CAM7890",
  "GEN2468",
  "EV0091",
  "PNK0001",
  "RC0012",
  "RC0018",
] as const;

const DEMO = new Set<string>(DEMO_LOCAL_PLATES);

export interface LocalUnitCandidate {
  companyId: string;
  unitNumber?: string;
  plate: string;
  make: string;
  model: string;
  year: number;
}

export interface ServerUnitIdentity {
  companyId: string;
  unitNumber: string;
  plate: string;
}

export type ImportSkipReason = "duplicate" | "ambiguous" | "demo" | "fleet";

export interface ImportPlanItem {
  reason: ImportSkipReason;
  detail: string;
  local: LocalUnitCandidate;
}

export interface ImportPlan {
  import: LocalUnitCandidate[];
  skipped: ImportPlanItem[];
}

function sameIdentity(local: LocalUnitCandidate, server: ServerUnitIdentity): boolean {
  if (local.companyId !== server.companyId) return false;
  const localKeys = [normalizePlate(local.plate), normalizePlate(local.unitNumber || "")].filter(Boolean);
  const serverKeys = [normalizePlate(server.plate), normalizePlate(server.unitNumber)].filter(Boolean);
  return localKeys.some((key) => serverKeys.includes(key));
}

function label(unitNumber: string | undefined, plate: string): string {
  const unit = unitNumber?.trim();
  return unit ? `Unit ${unit} ${plate}` : plate;
}

/**
 * Decide which on-device vans can join the server list.
 * A matching plate in the same company is one unit, even when the unit number differs.
 */
export function planLocalUnitImport(
  localUnits: LocalUnitCandidate[],
  serverUnits: ServerUnitIdentity[],
  allowedCompanyIds: string[]
): ImportPlan {
  const allowed = new Set(allowedCompanyIds);
  const plan: ImportPlan = { import: [], skipped: [] };
  const seen: ServerUnitIdentity[] = [...serverUnits];
  for (const local of localUnits) {
    const plateKey = normalizePlate(local.plate);
    if (!allowed.has(local.companyId)) {
      plan.skipped.push({
        reason: "fleet",
        detail: `${label(local.unitNumber, local.plate)} is outside taxi, tow, Turo, and service.`,
        local,
      });
      continue;
    }
    const match = seen.find((server) => sameIdentity(local, server));
    if (match) {
      const localUnit = normalizePlate(local.unitNumber || "");
      const serverUnit = normalizePlate(match.unitNumber);
      const ambiguous = Boolean(localUnit) && localUnit !== serverUnit && localUnit !== normalizePlate(match.plate);
      plan.skipped.push({
        reason: ambiguous ? "ambiguous" : "duplicate",
        detail: ambiguous
          ? `${label(local.unitNumber, local.plate)} matches server unit ${match.unitNumber} plate ${match.plate}. Left the server unit as-is.`
          : `${label(local.unitNumber, local.plate)} is already on the server.`,
        local,
      });
      continue;
    }
    if (DEMO.has(plateKey)) {
      plan.skipped.push({
        reason: "demo",
        detail: `${label(local.unitNumber, local.plate)} is an on-device example, not a fleet van.`,
        local,
      });
      continue;
    }
    plan.import.push(local);
    seen.push({
      companyId: local.companyId,
      unitNumber: local.unitNumber?.trim() || local.plate,
      plate: local.plate,
    });
  }
  return plan;
}
