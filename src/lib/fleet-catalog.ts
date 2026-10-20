export const SEEDED_SERVER_FLEETS = [
  {
    id: "fleet-rad-cab",
    name: "Rad Cab",
    type: "taxi",
    companyId: "company-rad-cab",
  },
  {
    id: "fleet-1st-choice",
    name: "1st Choice Recovery",
    type: "tow",
    companyId: "company-1st-choice",
  },
  {
    id: "fleet-pinkie-tow",
    name: "Pinkie Tow",
    type: "tow",
    companyId: "company-pinkie-tow",
  },
  {
    id: "fleet-turo",
    name: "Turo",
    type: "turo",
    companyId: "company-turo",
  },
  {
    id: "fleet-other-fleets",
    name: "Other fleets",
    type: "service_vehicle",
    companyId: "company-other-fleets",
  },
] as const;

export const FLEET_SEED_CREATED_AT = "2024-01-01T00:00:00.000Z";

const FLEET_TYPES = ["taxi", "tow", "turo", "service_vehicle"] as const;
export type CatalogFleetType = (typeof FLEET_TYPES)[number];

export function parseFleetType(value: unknown): CatalogFleetType | null {
  if (typeof value !== "string") return null;
  return FLEET_TYPES.includes(value as CatalogFleetType)
    ? (value as CatalogFleetType)
    : null;
}

export function parseFleetName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) return null;
  return name;
}
