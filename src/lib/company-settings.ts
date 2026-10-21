import {
  companyUsesClover,
  OTHER_FLEETS_COMPANY_ID,
  RAD_CAB_COMPANY_ID,
  TURO_COMPANY_ID,
} from "./company-rules";

const FIRST_CHOICE_COMPANY_ID = "company-1st-choice";
const PINKIE_TOW_COMPANY_ID = "company-pinkie-tow";
import {
  FLEET_TYPE_LABELS,
  PHOTO_ANGLES,
  walkaroundPhotoSteps,
} from "./types";
import type { FleetType, PhotoStep } from "./types";

export interface FleetTypeSetting {
  id: FleetType;
  label: string;
  enabled: boolean;
}

/** Stored only when an owner changes a default. Null means today's behavior. */
export interface CompanySettingsDoc {
  fleetTypes?: FleetTypeSetting[];
  photoRequired?: Partial<Record<FleetType, Partial<Record<string, boolean>>>>;
  /** Empty string means the owner turned Slack off. Absent means use the server webhook. */
  slackWebhook?: string;
  cloverCompanyIds?: string[];
  pdfLogoDataUrl?: string;
}

export interface PublicCompanySettings {
  fleetTypes: FleetTypeSetting[];
  photos: Record<FleetType, Record<string, boolean>>;
  cloverCompanyIds: string[];
  pdfLogoDataUrl: string | null;
  slackWebhookSet: boolean;
  usingDefaults: boolean;
}

export interface CompanySettingsPatch {
  fleetTypes?: FleetTypeSetting[];
  photos?: Partial<Record<FleetType, Record<string, boolean>>>;
  slackWebhook?: string;
  clearSlackWebhook?: boolean;
  cloverCompanyIds?: string[];
  pdfLogoDataUrl?: string;
  clearPdfLogo?: boolean;
}

const FLEET_TYPES = Object.keys(FLEET_TYPE_LABELS) as FleetType[];
const SLACK_HOOK = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/;
const LOGO_MAX = 180_000;
const KNOWN_COMPANIES = new Set([
  RAD_CAB_COMPANY_ID,
  FIRST_CHOICE_COMPANY_ID,
  TURO_COMPANY_ID,
  PINKIE_TOW_COMPANY_ID,
  OTHER_FLEETS_COMPANY_ID,
]);

export class CompanySettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanySettingsError";
  }
}

export function fleetTypeForCompany(companyId?: string | null): FleetType {
  if (companyId === RAD_CAB_COMPANY_ID) return "taxi";
  if (companyId === FIRST_CHOICE_COMPANY_ID || companyId === PINKIE_TOW_COMPANY_ID) return "tow";
  if (companyId === TURO_COMPANY_ID) return "turo";
  return "service_vehicle";
}

export function defaultFleetTypes(): FleetTypeSetting[] {
  return FLEET_TYPES.map((id) => ({
    id,
    label: FLEET_TYPE_LABELS[id],
    enabled: true,
  }));
}

function defaultRequired(angle: string): boolean {
  return PHOTO_ANGLES.find((step) => step.angle === angle)?.required !== false;
}

export function defaultPhotoMap(): Record<FleetType, Record<string, boolean>> {
  const angles = walkaroundPhotoSteps(PHOTO_ANGLES);
  const one = Object.fromEntries(angles.map((step) => [step.angle, step.required]));
  const withoutDocs = { ...one, registration: false, insurance: false };
  const withDocs = { ...withoutDocs, registration: true, insurance: true };
  return {
    taxi: withDocs,
    tow: { ...withoutDocs },
    turo: { ...withoutDocs },
    service_vehicle: { ...withoutDocs },
  };
}

export function parseCompanySettings(value: unknown): CompanySettingsDoc | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as CompanySettingsDoc;
}

export function effectiveFleetTypes(doc: CompanySettingsDoc | null | undefined): FleetTypeSetting[] {
  const defaults = defaultFleetTypes();
  if (!doc?.fleetTypes?.length) return defaults;
  return defaults.map((item) => {
    const saved = doc.fleetTypes?.find((row) => row.id === item.id);
    if (!saved) return item;
    const label = String(saved.label || "").trim().slice(0, 40);
    return {
      id: item.id,
      label: label || item.label,
      enabled: saved.enabled !== false,
    };
  });
}

export function effectivePhotos(
  doc: CompanySettingsDoc | null | undefined
): Record<FleetType, Record<string, boolean>> {
  const photos = defaultPhotoMap();
  if (!doc?.photoRequired) return photos;
  for (const type of FLEET_TYPES) {
    const rules = doc.photoRequired[type];
    if (!rules) continue;
    for (const [angle, required] of Object.entries(rules)) {
      if (angle in photos[type] && typeof required === "boolean") {
        photos[type][angle] = required;
      }
    }
  }
  return photos;
}

export function effectiveCloverIds(doc: CompanySettingsDoc | null | undefined): string[] {
  if (!doc || !Array.isArray(doc.cloverCompanyIds)) return [RAD_CAB_COMPANY_ID];
  return doc.cloverCompanyIds.filter((id) => KNOWN_COMPANIES.has(id));
}

export function pdfLogoDataUrl(doc: CompanySettingsDoc | null | undefined): string | null {
  const url = doc?.pdfLogoDataUrl;
  if (!url || !validLogo(url)) return null;
  return url;
}

/** Undefined keeps the server webhook. Null turns Slack off. A string replaces it. */
export function slackWebhookOverride(
  doc: CompanySettingsDoc | null | undefined
): string | null | undefined {
  if (!doc || doc.slackWebhook === undefined) return undefined;
  const url = doc.slackWebhook.trim();
  if (!url) return null;
  if (!SLACK_HOOK.test(url)) return undefined;
  return url;
}

export function publicCompanySettings(
  doc: CompanySettingsDoc | null | undefined
): PublicCompanySettings {
  const fleetTypes = effectiveFleetTypes(doc);
  const photos = effectivePhotos(doc);
  const cloverCompanyIds = effectiveCloverIds(doc);
  const logo = pdfLogoDataUrl(doc);
  const hook = slackWebhookOverride(doc);
  const usingDefaults = !doc || settingsDocIsEmpty(minimalDoc(doc));
  return {
    fleetTypes,
    photos,
    cloverCompanyIds,
    pdfLogoDataUrl: logo,
    slackWebhookSet: hook !== undefined,
    usingDefaults,
  };
}

export function photoStepsForCompany(
  settings: PublicCompanySettings | null | undefined,
  companyId?: string | null
): PhotoStep[] {
  const steps = walkaroundPhotoSteps(PHOTO_ANGLES);
  if (!settings || !companyId) return steps;
  const rules = settings.photos[fleetTypeForCompany(companyId)];
  if (!rules) return steps;
  return steps.map((step) =>
    typeof rules[step.angle] === "boolean" ? { ...step, required: rules[step.angle] } : step
  );
}

export function isCompanyEnabled(
  settings: PublicCompanySettings | null | undefined,
  companyId?: string | null
): boolean {
  if (!settings || !companyId) return true;
  const type = fleetTypeForCompany(companyId);
  return settings.fleetTypes.find((item) => item.id === type)?.enabled !== false;
}

export function usesClover(
  settings: PublicCompanySettings | null | undefined,
  companyId?: string | null
): boolean {
  if (!settings) return companyUsesClover(companyId);
  return settings.cloverCompanyIds.includes(companyId || "");
}

function validLogo(url: string): boolean {
  return (
    (url.startsWith("data:image/png;base64,") || url.startsWith("data:image/jpeg;base64,")) &&
    url.length <= LOGO_MAX
  );
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

function minimalDoc(doc: CompanySettingsDoc): CompanySettingsDoc {
  const next: CompanySettingsDoc = {};
  const fleetTypes = effectiveFleetTypes(doc).filter((item, index) => {
    const base = defaultFleetTypes()[index];
    return item.label !== base.label || item.enabled !== base.enabled;
  });
  if (fleetTypes.length) {
    next.fleetTypes = effectiveFleetTypes(doc);
  }
  const photos = effectivePhotos(doc);
  const defaults = defaultPhotoMap();
  const photoRequired: CompanySettingsDoc["photoRequired"] = {};
  for (const type of FLEET_TYPES) {
    const diff: Record<string, boolean> = {};
    for (const [angle, required] of Object.entries(photos[type])) {
      if (required !== defaults[type][angle]) diff[angle] = required;
    }
    if (Object.keys(diff).length) photoRequired[type] = diff;
  }
  if (Object.keys(photoRequired).length) next.photoRequired = photoRequired;
  if (doc.slackWebhook !== undefined && slackWebhookOverride(doc) !== undefined) {
    next.slackWebhook = slackWebhookOverride(doc) || "";
  }
  if (Array.isArray(doc.cloverCompanyIds) && !sameList(effectiveCloverIds(doc), [RAD_CAB_COMPANY_ID])) {
    next.cloverCompanyIds = effectiveCloverIds(doc);
  }
  const logo = pdfLogoDataUrl(doc);
  if (logo) next.pdfLogoDataUrl = logo;
  return next;
}

function settingsDocIsEmpty(doc: CompanySettingsDoc): boolean {
  return (
    !doc.fleetTypes &&
    !doc.photoRequired &&
    doc.slackWebhook === undefined &&
    !doc.cloverCompanyIds &&
    !doc.pdfLogoDataUrl
  );
}

export function mergeCompanySettings(
  current: CompanySettingsDoc | null,
  patch: CompanySettingsPatch
): CompanySettingsDoc | null {
  const base: CompanySettingsDoc = { ...(current || {}) };
  if (patch.fleetTypes) base.fleetTypes = patch.fleetTypes;
  if (patch.photos) {
    const photos = effectivePhotos(base);
    for (const type of FLEET_TYPES) {
      const incoming = patch.photos[type];
      if (!incoming) continue;
      for (const [angle, required] of Object.entries(incoming)) {
        if (angle in photos[type] && typeof required === "boolean") {
          photos[type][angle] = required;
        }
      }
    }
    base.photoRequired = photos;
  }
  if (patch.clearSlackWebhook) base.slackWebhook = "";
  if (typeof patch.slackWebhook === "string" && patch.slackWebhook.trim()) {
    const url = patch.slackWebhook.trim();
    if (!SLACK_HOOK.test(url)) {
      throw new CompanySettingsError("Slack webhook must be a Slack incoming webhook.");
    }
    base.slackWebhook = url;
  }
  if (patch.cloverCompanyIds) {
    base.cloverCompanyIds = patch.cloverCompanyIds.filter((id) => KNOWN_COMPANIES.has(id));
  }
  if (patch.clearPdfLogo) delete base.pdfLogoDataUrl;
  if (typeof patch.pdfLogoDataUrl === "string" && patch.pdfLogoDataUrl) {
    if (!validLogo(patch.pdfLogoDataUrl)) {
      throw new CompanySettingsError("Logo must be a small PNG or JPEG.");
    }
    base.pdfLogoDataUrl = patch.pdfLogoDataUrl;
  }
  const minimal = minimalDoc(base);
  return settingsDocIsEmpty(minimal) ? null : minimal;
}
