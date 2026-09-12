export type Powertrain = "gas" | "ev";

export type InspectionCheckId =
  | "oil"
  | "tirePressure"
  | "headlights"
  | "brakeLights"
  | "hazardsTurnSignal"
  | "licensePlateTabs"
  | "fuelLevel";

export type InspectionCheckState = {
  checked: boolean;
  na?: boolean;
  note?: string;
};

export type YesNo = "yes" | "no";

export type DamageSide = "left" | "right" | "front" | "rear";

export type InspectionIssueFlags = {
  safety?: boolean;
  needsRepair?: boolean;
  refuseToDrive?: boolean;
  outOfService?: boolean;
};

export type InspectionDamage = {
  left?: string;
  right?: string;
  front?: string;
  rear?: string;
  marks?: DamageSide[];
};

export type CheckoutInspectionForm = {
  inspectedAt?: string;
  cloverNumber?: string;
  powertrain: Powertrain;
  checks: Record<InspectionCheckId, InspectionCheckState>;
  interiorClean: YesNo | "";
  exteriorClean: YesNo | "";
  damage: InspectionDamage;
  additionalComments?: string;
  issueFlags?: InspectionIssueFlags;
};

export const INSPECTION_CHECK_ITEMS: ReadonlyArray<{
  id: InspectionCheckId;
  label: string;
  hint?: string;
  evSkips: boolean;
}> = [
  { id: "oil", label: "Oil", evSkips: true },
  {
    id: "tirePressure",
    label: "Tire Pressure",
    hint: "35 Psi",
    evSkips: false,
  },
  { id: "headlights", label: "Headlights", evSkips: false },
  { id: "brakeLights", label: "Brake Lights", evSkips: false },
  {
    id: "hazardsTurnSignal",
    label: "Hazards / Turn Signal",
    evSkips: false,
  },
  {
    id: "licensePlateTabs",
    label: "License Plate-Tabs",
    evSkips: false,
  },
  { id: "fuelLevel", label: "Fuel Level", evSkips: true },
];

export const DAMAGE_SIDES: ReadonlyArray<{
  id: DamageSide;
  label: string;
}> = [
  { id: "front", label: "Front" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "rear", label: "Rear" },
];

export const ISSUE_FLAG_ITEMS: ReadonlyArray<{
  id: keyof InspectionIssueFlags;
  label: string;
}> = [
  { id: "safety", label: "Safety issue" },
  { id: "needsRepair", label: "Needs repair" },
  { id: "refuseToDrive", label: "Refuse to drive" },
  { id: "outOfService", label: "Out of service" },
];

const EV_MAKE_TOKENS = [
  "tesla",
  "rivian",
  "lucid",
  "polestar",
  "fisker",
  "nio",
];

export function inferPowertrain(
  make?: string,
  model?: string,
  explicit?: Powertrain | string | null
): Powertrain {
  if (explicit === "ev" || explicit === "gas") return explicit;
  const hay = `${make ?? ""} ${model ?? ""}`.toLowerCase();
  if (EV_MAKE_TOKENS.some((token) => hay.includes(token))) return "ev";
  if (
    /\b(ev|bev|electric|id\.?4|ioniq|leaf|bolt|mach-?e|model [3ysx]|cybertruck)\b/.test(
      hay
    )
  ) {
    return "ev";
  }
  return "gas";
}

export function evSkipsCheck(
  id: InspectionCheckId,
  powertrain: Powertrain
): boolean {
  if (powertrain !== "ev") return false;
  return INSPECTION_CHECK_ITEMS.find((item) => item.id === id)?.evSkips === true;
}

function emptyChecks(powertrain: Powertrain): Record<
  InspectionCheckId,
  InspectionCheckState
> {
  return Object.fromEntries(
    INSPECTION_CHECK_ITEMS.map((item) => {
      const na = evSkipsCheck(item.id, powertrain);
      return [
        item.id,
        na ? { checked: false, na: true } : { checked: false },
      ];
    })
  ) as Record<InspectionCheckId, InspectionCheckState>;
}

export function createEmptyInspectionForm(
  powertrain: Powertrain = "gas",
  extras?: Partial<Pick<CheckoutInspectionForm, "inspectedAt" | "cloverNumber">>
): CheckoutInspectionForm {
  return {
    inspectedAt: extras?.inspectedAt,
    cloverNumber: extras?.cloverNumber,
    powertrain,
    checks: emptyChecks(powertrain),
    interiorClean: "",
    exteriorClean: "",
    damage: {},
    additionalComments: "",
    issueFlags: {},
  };
}

export function applyPowertrainToForm(
  form: CheckoutInspectionForm | undefined,
  powertrain: Powertrain
): CheckoutInspectionForm {
  const base = normalizeInspectionForm(form, powertrain);
  return {
    ...base,
    powertrain,
    checks: Object.fromEntries(
      INSPECTION_CHECK_ITEMS.map((item) => {
        const current = base.checks[item.id] ?? { checked: false };
        if (evSkipsCheck(item.id, powertrain)) {
          return [item.id, { ...current, checked: false, na: true }];
        }
        return [item.id, { ...current, na: undefined }];
      })
    ) as Record<InspectionCheckId, InspectionCheckState>,
  };
}

function asCheckState(value: unknown): InspectionCheckState {
  if (!value || typeof value !== "object") return { checked: false };
  const row = value as InspectionCheckState;
  return {
    checked: Boolean(row.checked),
    na: row.na ? true : undefined,
    note: typeof row.note === "string" ? row.note : undefined,
  };
}

function asYesNo(value: unknown): YesNo | "" {
  return value === "yes" || value === "no" ? value : "";
}

function asDamage(value: unknown): InspectionDamage {
  if (!value || typeof value !== "object") return {};
  const row = value as InspectionDamage;
  const marks = Array.isArray(row.marks)
    ? row.marks.filter(
        (side): side is DamageSide =>
          side === "left" ||
          side === "right" ||
          side === "front" ||
          side === "rear"
      )
    : undefined;
  return {
    left: typeof row.left === "string" ? row.left : undefined,
    right: typeof row.right === "string" ? row.right : undefined,
    front: typeof row.front === "string" ? row.front : undefined,
    rear: typeof row.rear === "string" ? row.rear : undefined,
    marks,
  };
}

function asIssueFlags(value: unknown): InspectionIssueFlags {
  if (!value || typeof value !== "object") return {};
  const row = value as InspectionIssueFlags;
  return {
    safety: row.safety ? true : undefined,
    needsRepair: row.needsRepair ? true : undefined,
    refuseToDrive: row.refuseToDrive ? true : undefined,
    outOfService: row.outOfService ? true : undefined,
  };
}

export function normalizeInspectionForm(
  raw: unknown,
  fallbackPowertrain: Powertrain = "gas"
): CheckoutInspectionForm {
  const row =
    raw && typeof raw === "object"
      ? (raw as Partial<CheckoutInspectionForm>)
      : {};
  const powertrain =
    row.powertrain === "ev" || row.powertrain === "gas"
      ? row.powertrain
      : fallbackPowertrain;
  const checks = emptyChecks(powertrain);
  if (row.checks && typeof row.checks === "object") {
    for (const item of INSPECTION_CHECK_ITEMS) {
      checks[item.id] = asCheckState(row.checks[item.id]);
      if (evSkipsCheck(item.id, powertrain)) {
        checks[item.id] = { ...checks[item.id], checked: false, na: true };
      } else {
        checks[item.id] = { ...checks[item.id], na: undefined };
      }
    }
  }
  return {
    inspectedAt:
      typeof row.inspectedAt === "string" ? row.inspectedAt : undefined,
    cloverNumber:
      typeof row.cloverNumber === "string" ? row.cloverNumber : undefined,
    powertrain,
    checks,
    interiorClean: asYesNo(row.interiorClean),
    exteriorClean: asYesNo(row.exteriorClean),
    damage: asDamage(row.damage),
    additionalComments:
      typeof row.additionalComments === "string"
        ? row.additionalComments
        : undefined,
    issueFlags: asIssueFlags(row.issueFlags),
  };
}

export function validateInspectionForm(
  form: CheckoutInspectionForm | undefined,
  powertrain: Powertrain
): { ok: true; form: CheckoutInspectionForm } | { ok: false; error: string } {
  if (!form) {
    return { ok: false, error: "Fill the inspection checklist before submitting." };
  }
  const normalized = applyPowertrainToForm(form, powertrain);
  const missing = INSPECTION_CHECK_ITEMS.filter((item) => {
    const state = normalized.checks[item.id];
    if (state.na || evSkipsCheck(item.id, powertrain)) return false;
    return !state.checked;
  });
  if (missing.length) {
    return {
      ok: false,
      error: `Check ${missing.map((item) => item.label).join(", ")}.`,
    };
  }
  if (normalized.interiorClean !== "yes" && normalized.interiorClean !== "no") {
    return { ok: false, error: "Mark Interior clean Yes or No." };
  }
  if (normalized.exteriorClean !== "yes" && normalized.exteriorClean !== "no") {
    return { ok: false, error: "Mark Exterior clean Yes or No." };
  }
  return { ok: true, form: normalized };
}

export function inspectionCheckLabel(id: InspectionCheckId): string {
  return INSPECTION_CHECK_ITEMS.find((item) => item.id === id)?.label ?? id;
}

export function formatCheckResult(state: InspectionCheckState): string {
  if (state.na) return "N/A";
  return state.checked ? "Checked" : "Not checked";
}

export function hasInspectionIssueFlags(
  form?: CheckoutInspectionForm | null
): boolean {
  const flags = form?.issueFlags;
  return Boolean(
    flags?.safety ||
      flags?.needsRepair ||
      flags?.refuseToDrive ||
      flags?.outOfService
  );
}

export function hasInspectionDamageNotes(
  form?: CheckoutInspectionForm | null
): boolean {
  if (!form) return false;
  const { left, right, front, rear, marks } = form.damage ?? {};
  return Boolean(
    left?.trim() ||
      right?.trim() ||
      front?.trim() ||
      rear?.trim() ||
      (marks && marks.length > 0)
  );
}

export function inspectionFormFlagsReport(
  form?: CheckoutInspectionForm | null
): boolean {
  return hasInspectionIssueFlags(form) || hasInspectionDamageNotes(form);
}

export function activeIssueFlagLabels(
  form?: CheckoutInspectionForm | null
): string[] {
  if (!form?.issueFlags) return [];
  return ISSUE_FLAG_ITEMS.filter((item) => form.issueFlags?.[item.id]).map(
    (item) => item.label
  );
}

export function inspectionFormSummaryLines(
  form: CheckoutInspectionForm
): string[] {
  const lines: string[] = [];
  lines.push(
    `Powertrain: ${form.powertrain === "ev" ? "EV (oil / fuel N/A)" : "Gas"}`
  );
  for (const item of INSPECTION_CHECK_ITEMS) {
    const state = form.checks[item.id];
    const note = state.note?.trim();
    lines.push(
      `${item.label}: ${formatCheckResult(state)}${note ? ` — ${note}` : ""}`
    );
  }
  lines.push(
    `Interior clean: ${form.interiorClean === "yes" ? "Yes" : form.interiorClean === "no" ? "No" : "—"}`
  );
  lines.push(
    `Exterior clean: ${form.exteriorClean === "yes" ? "Yes" : form.exteriorClean === "no" ? "No" : "—"}`
  );
  for (const side of DAMAGE_SIDES) {
    const marked = form.damage.marks?.includes(side.id);
    const note = form.damage[side.id]?.trim();
    if (marked || note) {
      lines.push(
        `${side.label} damage: ${[marked ? "marked" : null, note].filter(Boolean).join(" — ")}`
      );
    }
  }
  if (!hasInspectionDamageNotes(form)) {
    lines.push("Damage notes: none");
  }
  const flags = activeIssueFlagLabels(form);
  if (flags.length) lines.push(`Issue flags: ${flags.join(", ")}`);
  if (form.additionalComments?.trim()) {
    lines.push(`Additional comments: ${form.additionalComments.trim()}`);
  }
  return lines;
}

export function toggleDamageMark(
  form: CheckoutInspectionForm,
  side: DamageSide
): CheckoutInspectionForm {
  const marks = new Set(form.damage.marks ?? []);
  if (marks.has(side)) marks.delete(side);
  else marks.add(side);
  return {
    ...form,
    damage: {
      ...form.damage,
      marks: [...marks],
    },
  };
}
