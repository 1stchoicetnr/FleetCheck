export interface CountedUnit {
  companyId: string;
  archivedAt?: string;
}

export interface UnitCounts {
  total: number;
  active: number;
  archived: number;
  byCompany: Record<string, { active: number; archived: number }>;
}

export function unitsForCompany<T extends { companyId: string }>(
  units: T[],
  companyId: string
): T[] {
  if (!companyId) return [];
  return units.filter((unit) => unit.companyId === companyId);
}

export function summarizeUnits(units: CountedUnit[]): UnitCounts {
  const byCompany: UnitCounts["byCompany"] = {};
  let archived = 0;
  for (const unit of units) {
    const bucket = byCompany[unit.companyId] ?? { active: 0, archived: 0 };
    if (unit.archivedAt) {
      archived += 1;
      bucket.archived += 1;
    } else {
      bucket.active += 1;
    }
    byCompany[unit.companyId] = bucket;
  }
  return {
    total: units.length,
    active: units.length - archived,
    archived,
    byCompany,
  };
}

/** Same sentence on Dashboard, Units, and Admin. */
export function unitCountLine(summary: UnitCounts): string {
  return `${summary.active} active · ${summary.archived} archived · ${summary.total} total`;
}
