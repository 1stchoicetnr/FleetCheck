import { RAD_CAB_COMPANY_ID } from "./company-rules.ts";
import type { KnownDamage } from "./known-damage.ts";
import { damageDescriptionsMatch } from "./on-file-damage.ts";
import type { PhotoAngle } from "./types.ts";

/**
 * Known – not fixing for Rad Cab units that already have this damage.
 * Matched by unit number inside the Rad Cab company only.
 *
 * Angles are the photo slots the on-file matcher compares:
 * left-front is the Front 3/4 Left slot (`lf_corner`; `lf_fender` is the
 * same left-front body area), front bumper is `front`, rear bumper is `rear`.
 * Existing open alerts are left for the office. This list does not close them.
 */
export const RAD_CAB_KNOWN_SEED_AT = "2026-11-27T21:00:00.000Z";

export interface RadCabKnownSeed {
  id: string;
  unitNumber: string;
  angle: PhotoAngle;
  description: string;
}

export const RAD_CAB_KNOWN_SEED: readonly RadCabKnownSeed[] = [
  { id: "kd_seed_rad_8_lf", unitNumber: "8", angle: "lf_corner", description: "left-front bumper crack" },
  { id: "kd_seed_rad_9_front", unitNumber: "9", angle: "front", description: "front bumper damage" },
  { id: "kd_seed_rad_9_rear", unitNumber: "9", angle: "rear", description: "rear bumper damage" },
  { id: "kd_seed_rad_2_lf", unitNumber: "2", angle: "lf_corner", description: "left-front damage" },
  { id: "kd_seed_rad_5_rear", unitNumber: "5", angle: "rear", description: "rear bumper damage" },
  { id: "kd_seed_rad_11_front", unitNumber: "11", angle: "front", description: "front bumper damage" },
];

/** "Unit 8", "#08", "8" and "11 Chrysler 200" match unit 11. "18" does not match 8. */
export function unitNumbersMatch(stored: string, wanted: string): boolean {
  const key = (value: string) =>
    value
      .trim()
      .replace(/^unit\s+/i, "")
      .replace(/^#\s*/, "")
      .replace(/^0+(?=\d)/, "")
      .toLowerCase();
  const raw = key(stored);
  const want = key(wanted);
  if (!raw || !want) return false;
  if (raw === want) return true;
  const prefix = /^(\d+)\b/.exec(raw);
  return prefix?.[1] === want;
}

function seedItem(spec: RadCabKnownSeed, vehicleId: string): KnownDamage {
  return {
    id: spec.id,
    vehicleId,
    angle: spec.angle,
    description: spec.description,
    status: "not_fixing",
    createdAt: RAD_CAB_KNOWN_SEED_AT,
    createdBy: "Seed",
  };
}

function alreadySeeded(existing: readonly KnownDamage[], spec: RadCabKnownSeed): boolean {
  return existing.some((item) => {
    if (item.id === spec.id) return true;
    if (item.angle !== spec.angle) return false;
    if (item.description.trim().toLowerCase() === spec.description.toLowerCase()) return true;
    return (
      damageDescriptionsMatch(spec.description, item.description) ||
      damageDescriptionsMatch(item.description, spec.description)
    );
  });
}

/**
 * Add any missing seed rows for this unit. Returns the full list.
 * A second call adds nothing. Repaired seed ids are not put back.
 */
export function mergeRadCabKnownSeed(
  unitNumber: string,
  companyId: string,
  existing: readonly KnownDamage[],
  vehicleId = existing[0]?.vehicleId ?? ""
): { list: KnownDamage[]; added: number } {
  if (companyId !== RAD_CAB_COMPANY_ID) return { list: [...existing], added: 0 };
  const specs = RAD_CAB_KNOWN_SEED.filter((spec) => unitNumbersMatch(unitNumber, spec.unitNumber));
  if (!specs.length) return { list: [...existing], added: 0 };
  const list = [...existing];
  let added = 0;
  for (const spec of specs) {
    if (alreadySeeded(list, spec)) continue;
    list.push(seedItem(spec, vehicleId));
    added += 1;
  }
  return { list, added };
}
