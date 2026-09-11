import {
  ChecklistId,
  Company,
  PHOTO_ANGLES,
  PhotoStep,
} from "./types";

export const RAD_CAB_COMPANY_ID = "company-rad-cab";
export const FIRST_CHOICE_COMPANY_ID = "company-1st-choice";
export const PINKIE_TOW_COMPANY_ID = "company-pinkie-tow";
export const OTHER_FLEETS_COMPANY_ID = "company-other-fleets";

export const RAD_CAB_SLUG = "rad-cab";

/** Demo office PIN — light MVP auth. Change in Admin later if needed. */
export const DEFAULT_OFFICE_PIN = "1357";

export const SEEDED_COMPANIES: Company[] = [
  {
    id: RAD_CAB_COMPANY_ID,
    name: "Rad Cab",
    slug: RAD_CAB_SLUG,
    checklistId: "radcab_default",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: FIRST_CHOICE_COMPANY_ID,
    name: "1st Choice Recovery",
    slug: "1st-choice-recovery",
    checklistId: "generic_30",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: PINKIE_TOW_COMPANY_ID,
    name: "Pinkie Tow",
    slug: "pinkie-tow",
    checklistId: "generic_30",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: OTHER_FLEETS_COMPANY_ID,
    name: "Other fleets",
    slug: "other-fleets",
    checklistId: "generic_30",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

export function companyIdForFleetType(type: string): string {
  if (type === "taxi") return RAD_CAB_COMPANY_ID;
  if (type === "tow") return FIRST_CHOICE_COMPANY_ID;
  return OTHER_FLEETS_COMPANY_ID;
}

const CHECKLISTS: Record<ChecklistId, PhotoStep[]> = {
  // Same clockwise walkaround as PHOTO_ANGLES (docs → exterior → cabin → engine).
  radcab_default: PHOTO_ANGLES,
  generic_30: PHOTO_ANGLES,
};

export function getChecklistForCompany(company?: Company | null): PhotoStep[] {
  if (!company) return PHOTO_ANGLES;
  return CHECKLISTS[company.checklistId] ?? PHOTO_ANGLES;
}

export function companyById(
  companies: Company[],
  id: string
): Company | undefined {
  return companies.find((c) => c.id === id);
}

export function defaultCompanyId(companies: Company[]): string {
  return (
    companies.find((c) => c.slug === RAD_CAB_SLUG)?.id ??
    companies[0]?.id ??
    RAD_CAB_COMPANY_ID
  );
}
