import { fleetTypeLabel } from "./types";

export interface FleetNameSource {
  name: string;
  type: string;
}

export interface FleetCountSource {
  id: string;
  companyId?: string | null;
}

export interface FleetVehicleCount {
  fleetId?: string | null;
  companyId?: string | null;
  archivedAt?: string | null;
}

function sameLabel(a: string, b: string): boolean {
  return a.localeCompare(b, "en", { sensitivity: "accent" }) === 0;
}

/** Stored fleet names were rewritten to the type label. Use the company name then. */
export function fleetTitle(fleet: FleetNameSource, companyName?: string | null): string {
  const stored = fleet.name.trim();
  const typeLabel = fleetTypeLabel(fleet.type);
  if (stored && !sameLabel(stored, typeLabel)) return stored;
  const company = companyName?.trim();
  if (company) return company;
  return stored || typeLabel;
}

/** Type sits under the name only when it is not already the title. */
export function fleetSubtitle(title: string, type: string): string | null {
  const typeLabel = fleetTypeLabel(type);
  if (!typeLabel || sameLabel(typeLabel, title)) return null;
  return typeLabel;
}

/**
 * Active vehicles for each fleet id.
 * A vehicle with a fleet id counts on that fleet only.
 * A vehicle with only a company counts on a fleet when that company has one fleet.
 * Shared companies are not copied onto every fleet of that type.
 */
export function activeCountByFleetId(
  fleets: FleetCountSource[],
  vehicles: FleetVehicleCount[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  const byCompany = new Map<string, string[]>();
  for (const fleet of fleets) {
    counts[fleet.id] = 0;
    if (!fleet.companyId) continue;
    const ids = byCompany.get(fleet.companyId) ?? [];
    ids.push(fleet.id);
    byCompany.set(fleet.companyId, ids);
  }

  for (const vehicle of vehicles) {
    if (vehicle.archivedAt) continue;
    if (vehicle.fleetId) {
      if (vehicle.fleetId in counts) counts[vehicle.fleetId] += 1;
      continue;
    }
    const owners = vehicle.companyId ? byCompany.get(vehicle.companyId) : undefined;
    if (owners && owners.length === 1) counts[owners[0]] += 1;
  }

  return counts;
}

export function activeCountLabel(count: number): string {
  return `${count} active`;
}
