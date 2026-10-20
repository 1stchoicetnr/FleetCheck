import {
  FIRST_CHOICE_COMPANY_ID,
  OTHER_FLEETS_COMPANY_ID,
  RAD_CAB_COMPANY_ID,
  TURO_COMPANY_ID,
} from "./companies";
import { fetchVehicles, upsertSharedVehicle } from "./checkout-api";
import { planLocalUnitImport } from "./import-local-units";
import { getVehicles } from "./storage";

const STORAGE_KEY = "fleetcheck-unit-import-v1";

export interface UnitImportReport {
  imported: string[];
  skipped: { reason: string; detail: string }[];
}

export async function runLocalUnitImport(): Promise<UnitImportReport> {
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return JSON.parse(cached) as UnitImportReport;
  }
  const allowed = [
    RAD_CAB_COMPANY_ID,
    FIRST_CHOICE_COMPANY_ID,
    TURO_COMPANY_ID,
    OTHER_FLEETS_COMPANY_ID,
  ];
  const [local, ...lists] = await Promise.all([
    getVehicles(),
    ...allowed.map((companyId) => fetchVehicles(companyId, { includeArchived: true })),
  ]);
  const plan = planLocalUnitImport(local, lists.flat(), allowed);
  const imported: string[] = [];
  for (const unit of plan.import) {
    const saved = await upsertSharedVehicle({
      companyId: unit.companyId,
      unitNumber: unit.unitNumber?.trim() || unit.plate,
      plate: unit.plate,
      make: unit.make,
      model: unit.model,
      year: unit.year,
    });
    imported.push(`Unit ${saved.unitNumber} ${saved.plate}`);
  }
  const report: UnitImportReport = {
    imported,
    skipped: plan.skipped
      .filter((item) => item.reason === "ambiguous" || item.reason === "fleet")
      .map((item) => ({ reason: item.reason, detail: item.detail })),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  }
  return report;
}
