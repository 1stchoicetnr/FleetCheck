export type Powertrain = "gas" | "ev";

export type InspectionCheckId =
  | "oil"
  | "tirePressure"
  | "headlights"
  | "brakeLights"
  | "hazardsTurnSignal"
  | "licensePlateTabs"
  | "fuelLevel";

export type CheckResult = "ok" | "not_ok" | "na";

export type InspectionCheckState = {
  result: CheckResult | "";
  note?: string;
  /** Legacy paper-form field — mapped to result on read. */
  checked?: boolean;
  /** Legacy paper-form field — mapped to result on read. */
  na?: boolean;
};

export type YesNo = "yes" | "no";

export type DamageSide = "left" | "right" | "front" | "rear";

export type TreadLevel = "good" | "fair" | "low" | "bald";

export type TrafficLight = "green" | "yellow" | "red";

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
  treadLevel?: TreadLevel | "";
  trafficLight?: TrafficLight | "";
  trafficNote?: string;
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
    label: "All corners OK @ 35 psi?",
    hint: "One answer for all four tires — not four fields.",
    evSkips: false,
  },
  { id: "headlights", label: "Headlights", evSkips: false },
  { id: "brakeLights", label: "Brake lights", evSkips: false },
  {
    id: "hazardsTurnSignal",
    label: "Hazards / Turn signal",
    evSkips: false,
  },
  {
    id: "licensePlateTabs",
    label: "License plate-tabs",
    evSkips: false,
  },
  { id: "fuelLevel", label: "Fuel level", evSkips: true },
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

export const TREAD_LEVEL_ITEMS: ReadonlyArray<{
  id: TreadLevel;
  label: string;
  hint: string;
}> = [
  { id: "good", label: "Good", hint: "Plenty of tread" },
  { id: "fair", label: "Fair", hint: "Wear showing, still OK" },
  { id: "low", label: "Low", hint: "Note & drive" },
  { id: "bald", label: "Bald", hint: "Park it" },
];

export const TRAFFIC_LIGHT_ITEMS: ReadonlyArray<{
  id: TrafficLight;
  label: string;
  action: string;
}> = [
  { id: "green", label: "Green", action: "Good to go → photos" },
  { id: "yellow", label: "Yellow", action: "Note & drive → photos" },
  { id: "red", label: "Red", action: "Park it — no photos" },
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
      return [item.id, na ? { result: "na" as const } : { result: "" as const }];
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
    treadLevel: "",
    trafficLight: "",
    trafficNote: "",
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
        const current = base.checks[item.id] ?? { result: "" };
        if (evSkipsCheck(item.id, powertrain)) {
          return [item.id, { ...current, result: "na" as const }];
        }
        if (current.result === "na") {
          return [item.id, { ...current, result: "" as const }];
        }
        return [item.id, current];
      })
    ) as Record<InspectionCheckId, InspectionCheckState>,
  };
}

function asCheckState(value: unknown): InspectionCheckState {
  if (!value || typeof value !== "object") return { result: "" };
  const row = value as InspectionCheckState;
  if (row.result === "ok" || row.result === "not_ok" || row.result === "na") {
    return {
      result: row.result,
      note: typeof row.note === "string" ? row.note : undefined,
    };
  }
  if (row.na) {
    return {
      result: "na",
      note: typeof row.note === "string" ? row.note : undefined,
    };
  }
  if (row.checked) {
    return {
      result: "ok",
      note: typeof row.note === "string" ? row.note : undefined,
    };
  }
  return {
    result: "",
    note: typeof row.note === "string" ? row.note : undefined,
  };
}

function asYesNo(value: unknown): YesNo | "" {
  return value === "yes" || value === "no" ? value : "";
}

function asTreadLevel(value: unknown): TreadLevel | "" {
  return value === "good" ||
    value === "fair" ||
    value === "low" ||
    value === "bald"
    ? value
    : "";
}

function asTrafficLight(value: unknown): TrafficLight | "" {
  return value === "green" || value === "yellow" || value === "red"
    ? value
    : "";
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
        checks[item.id] = { ...checks[item.id], result: "na" };
      } else if (checks[item.id].result === "na") {
        checks[item.id] = { ...checks[item.id], result: "" };
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
    treadLevel: asTreadLevel(row.treadLevel),
    trafficLight: asTrafficLight(row.trafficLight),
    trafficNote:
      typeof row.trafficNote === "string" ? row.trafficNote : undefined,
    damage: asDamage(row.damage),
    additionalComments:
      typeof row.additionalComments === "string"
        ? row.additionalComments
        : undefined,
    issueFlags: asIssueFlags(row.issueFlags),
  };
}

export function precheckNote(form: CheckoutInspectionForm): string {
  return (form.trafficNote || form.additionalComments || "").trim();
}

export function suggestedTrafficLight(
  form: CheckoutInspectionForm
): TrafficLight {
  const flags = form.issueFlags ?? {};
  if (
    flags.refuseToDrive ||
    flags.outOfService ||
    flags.safety ||
    form.treadLevel === "bald"
  ) {
    return "red";
  }
  const hasIssue = INSPECTION_CHECK_ITEMS.some(
    (item) => form.checks[item.id]?.result === "not_ok"
  );
  if (
    flags.needsRepair ||
    form.treadLevel === "low" ||
    hasIssue ||
    form.interiorClean === "no" ||
    form.exteriorClean === "no" ||
    hasInspectionDamageNotes(form)
  ) {
    return "yellow";
  }
  return "green";
}

export function applyTrafficLightDefaults(
  form: CheckoutInspectionForm
): CheckoutInspectionForm {
  if (form.trafficLight !== "red") return form;
  return {
    ...form,
    issueFlags: {
      ...form.issueFlags,
      needsRepair: true,
    },
  };
}

export function validateInspectionForm(
  form: CheckoutInspectionForm | undefined,
  powertrain: Powertrain
): { ok: true; form: CheckoutInspectionForm } | { ok: false; error: string } {
  if (!form) {
    return { ok: false, error: "Fill Precheck before submitting." };
  }
  const normalized = applyTrafficLightDefaults(
    applyPowertrainToForm(form, powertrain)
  );
  const missing = INSPECTION_CHECK_ITEMS.filter((item) => {
    const state = normalized.checks[item.id];
    if (state.result === "na" || evSkipsCheck(item.id, powertrain)) return false;
    return state.result !== "ok" && state.result !== "not_ok";
  });
  if (missing.length) {
    return {
      ok: false,
      error: `Answer ${missing.map((item) => item.label).join(", ")}.`,
    };
  }
  if (
    normalized.treadLevel !== "good" &&
    normalized.treadLevel !== "fair" &&
    normalized.treadLevel !== "low" &&
    normalized.treadLevel !== "bald"
  ) {
    return { ok: false, error: "Mark tread: Good, Fair, Low, or Bald." };
  }
  if (normalized.interiorClean !== "yes" && normalized.interiorClean !== "no") {
    return { ok: false, error: "Mark Interior clean Yes or No." };
  }
  if (normalized.exteriorClean !== "yes" && normalized.exteriorClean !== "no") {
    return { ok: false, error: "Mark Exterior clean Yes or No." };
  }
  if (
    normalized.trafficLight !== "green" &&
    normalized.trafficLight !== "yellow" &&
    normalized.trafficLight !== "red"
  ) {
    return {
      ok: false,
      error: "Pick Green, Yellow, or Red at the end of Precheck.",
    };
  }
  if (
    (normalized.trafficLight === "yellow" ||
      normalized.trafficLight === "red") &&
    !precheckNote(normalized)
  ) {
    return {
      ok: false,
      error:
        normalized.trafficLight === "red"
          ? "Add a short note for Red — park it."
          : "Add a short note for Yellow — note & drive.",
    };
  }
  return { ok: true, form: normalized };
}

export function canContinueToPhotos(
  form: CheckoutInspectionForm | undefined,
  powertrain: Powertrain
): boolean {
  const result = validateInspectionForm(form, powertrain);
  return result.ok && result.form.trafficLight !== "red";
}

export function isPrecheckRed(form?: CheckoutInspectionForm | null): boolean {
  return form?.trafficLight === "red";
}

export function isPrecheckYellow(form?: CheckoutInspectionForm | null): boolean {
  return form?.trafficLight === "yellow";
}

export function inspectionCheckLabel(id: InspectionCheckId): string {
  return INSPECTION_CHECK_ITEMS.find((item) => item.id === id)?.label ?? id;
}

export function formatCheckResult(state: InspectionCheckState): string {
  if (state.result === "na" || state.na) return "N/A";
  if (state.result === "ok" || state.checked) return "OK";
  if (state.result === "not_ok") return "Issue";
  return "Not answered";
}

export function treadLevelLabel(level?: TreadLevel | "" | null): string {
  if (!level) return "—";
  return TREAD_LEVEL_ITEMS.find((item) => item.id === level)?.label ?? level;
}

export function trafficLightLabel(light?: TrafficLight | "" | null): string {
  if (light === "green") return "Green — good to go";
  if (light === "yellow") return "Yellow — note & drive";
  if (light === "red") return "Red — park it";
  return "—";
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

export function hasNotOkChecks(form?: CheckoutInspectionForm | null): boolean {
  if (!form) return false;
  return INSPECTION_CHECK_ITEMS.some(
    (item) => form.checks[item.id]?.result === "not_ok"
  );
}

export function inspectionFormFlagsReport(
  form?: CheckoutInspectionForm | null
): boolean {
  if (!form) return false;
  return (
    form.trafficLight === "red" ||
    form.trafficLight === "yellow" ||
    form.treadLevel === "bald" ||
    form.treadLevel === "low" ||
    hasInspectionIssueFlags(form) ||
    hasInspectionDamageNotes(form) ||
    hasNotOkChecks(form)
  );
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
  lines.push(`Traffic light: ${trafficLightLabel(form.trafficLight)}`);
  if (precheckNote(form)) {
    lines.push(`Traffic note: ${precheckNote(form)}`);
  }
  lines.push(
    `Powertrain: ${form.powertrain === "ev" ? "EV (oil / fuel N/A)" : "Gas"}`
  );
  lines.push(`Tread: ${treadLevelLabel(form.treadLevel)}`);
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
