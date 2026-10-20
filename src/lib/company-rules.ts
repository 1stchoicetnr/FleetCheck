export const RAD_CAB_COMPANY_ID = "company-rad-cab";
export const OTHER_FLEETS_COMPANY_ID = "company-other-fleets";
export const TURO_COMPANY_ID = "company-turo";

/** Clover is the Rad Cab card reader drivers borrow. Other companies do not use it. */
export function companyUsesClover(companyId?: string | null): boolean {
  return companyId === RAD_CAB_COMPANY_ID;
}

function compact(value?: string): string {
  return (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * TUR-9012 lived under Other fleets. Move that van, and any other Turo plate
 * parked in Other fleets, onto the Turo company. Leave every other company alone.
 */
export function shouldMoveUnitToTuro(unit: {
  companyId: string;
  unitNumber?: string;
  plate?: string;
}): boolean {
  if (unit.companyId !== OTHER_FLEETS_COMPANY_ID) return false;
  const plate = compact(unit.plate);
  const unitNumber = compact(unit.unitNumber);
  return plate.startsWith("TUR") || unitNumber === "9012" || unitNumber === "TUR9012";
}
