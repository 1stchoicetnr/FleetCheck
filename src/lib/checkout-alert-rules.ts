export type CheckoutAlertKind =
  | "damage_reported"
  | "status_needs_work"
  | "status_out_of_service";

export interface CheckoutAlertFacts {
  needsRepair?: boolean;
  photoDamage?: boolean;
  damageNotes?: boolean;
  safety?: boolean;
  refuseToDrive?: boolean;
  outOfService?: boolean;
}

/** Alerts a submitted checkout should create. Empty when nothing is wrong. */
export function checkoutAlertKinds(facts: CheckoutAlertFacts): CheckoutAlertKind[] {
  const kinds: CheckoutAlertKind[] = [];
  if (
    facts.photoDamage ||
    facts.damageNotes ||
    facts.needsRepair ||
    facts.safety ||
    facts.refuseToDrive
  ) {
    kinds.push("damage_reported");
  }
  if (facts.needsRepair) kinds.push("status_needs_work");
  if (facts.outOfService) kinds.push("status_out_of_service");
  return kinds;
}

export function checkoutAlertId(reportId: string, kind: CheckoutAlertKind): string {
  return `${reportId}:${kind}`;
}
