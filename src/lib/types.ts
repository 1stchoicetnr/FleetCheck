import type { CheckoutInspectionForm } from "./inspection-form";

export type UserRole = "super_admin" | "management" | "tech" | "driver";

export type FleetType = "taxi" | "tow" | "turo" | "service_vehicle";

/** @deprecated Migrated to service_vehicle in IndexedDB v5 */
export type LegacyFleetType = "camera_car" | "other";

export type StoredFleetType = FleetType | LegacyFleetType;

export function normalizeFleetType(type: string): FleetType {
  if (type === "camera_car" || type === "other") return "service_vehicle";
  if (type === "taxi" || type === "tow" || type === "turo" || type === "service_vehicle") {
    return type;
  }
  return "service_vehicle";
}

export const FLEET_TYPES: FleetType[] = [
  "taxi",
  "tow",
  "service_vehicle",
  "turo",
];

export type VehicleStatus =
  | "ready"
  | "checked_out"
  | "needs_work"
  | "out_of_service";

export type ConditionRating = "good" | "fair" | "poor";

export type CheckType = "check_in" | "check_out";

export type MaintenanceIssue =
  | "low_tire"
  | "ac"
  | "noise"
  | "dashboard_light"
  | "brakes"
  | "other";

export type PhotoAngle =
  | "lf_corner"
  | "lf_fender"
  | "lf_tire"
  | "lf_wheel"
  | "driver_doors"
  | "lr_quarter_panel"
  | "lr_tire"
  | "lr_wheel"
  | "lr_corner"
  | "rear"
  | "front"
  | "rf_corner"
  | "rf_fender"
  | "rf_tire"
  | "rf_wheel"
  | "passenger_doors"
  | "rr_quarter_panel"
  | "rr_tire"
  | "rr_wheel"
  | "rr_corner"
  | "driver_door_in"
  | "driver_rear_door_in"
  | "trunk_interior"
  | "passenger_rear_in"
  | "passenger_front_in"
  | "registration"
  | "engine_oil"
  | "odometer_fuel"
  | "windshield"
  | "radio_climate";

export interface PhotoStep {
  angle: PhotoAngle;
  label: string;
  instruction: string;
  icon: string;
  /** exterior = full vehicle; detail = close-up; interior = cabin */
  category: "exterior" | "detail" | "interior";
  required: boolean;
  /** Office-leniency / capture tip shown under the instruction */
  helper?: string;
}

export type ChecklistId = "radcab_default" | "generic_30";

export interface Company {
  id: string;
  name: string;
  slug: string;
  /** Which photo checklist this company uses. Others can add their own later. */
  checklistId: ChecklistId;
  createdAt: string;
}

export type CheckoutType = "check_out" | "check_in";

export type CheckoutReviewStatus = "pending" | "pass" | "conditional" | "fail";

export const CHECKOUT_REVIEW_LABELS: Record<CheckoutReviewStatus, string> = {
  pending: "Pending review",
  pass: "PASS",
  conditional: "Conditional",
  fail: "FAIL",
};

export const CHECKOUT_REVIEW_COLORS: Record<CheckoutReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  pass: "bg-green-100 text-green-800",
  conditional: "bg-orange-100 text-orange-800",
  fail: "bg-red-100 text-red-800",
};

export interface CheckoutReport {
  id: string;
  companyId: string;
  vehicleId: string;
  unitNumber: string;
  /** License plate copied onto the report so Office can show it without a seed row. */
  plate?: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  driverName: string;
  dispatcherName: string;
  type: CheckoutType;
  /** Precheck (paper inspection) completed before the photo walkaround. */
  inspectionForm?: CheckoutInspectionForm;
  photos: VehiclePhoto[];
  /** Driver finished capture */
  status: "complete";
  completedAt: string;
  reviewStatus: CheckoutReviewStatus;
  reviewNotes?: string;
  /** Office notes about NEW damage vs prior reports */
  newDamageNotes?: string;
  /** Slots the office wants retaken (Conditional) */
  retakeAngles?: PhotoAngle[];
  reviewedAt?: string;
  reviewedBy?: string;
  flagged: boolean;
  synced: boolean;
  createdAt: string;
  /** Driver signature image (data URL or Blob URL). */
  signatureDataUrl?: string;
  signedAt?: string;
}

/** In-progress checkout report saved locally for offline resume. */
export interface CheckoutDraft {
  id: string;
  companyId: string;
  vehicleId: string;
  type: CheckoutType;
  driverId: string;
  driverName: string;
  dispatcherName: string;
  odometer: string;
  year: string;
  make: string;
  model: string;
  photos: Partial<Record<PhotoAngle, string>>;
  photoFlags?: Partial<
    Record<PhotoAngle, { flaggedDamage: boolean; damageNote?: string }>
  >;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  fleetIds: string[];
  companyIds: string[];
}

export interface Fleet {
  id: string;
  name: string;
  type: StoredFleetType;
  companyId: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  fleetId: string;
  companyId: string;
  /** Fleet unit number (e.g. Rad Cab "12"). Falls back to plate in UI. */
  unitNumber: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  status: VehicleStatus;
  lastMileage?: number;
  lastOilChangeMileage?: number;
  qrCode: string;
  createdAt: string;
  knownIssue?: VehicleKnownIssue;
}

export interface VehicleKnownIssue {
  text: string;
  isOpen: boolean;
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface KnownIssueConsent {
  issueText: string;
  driverName: string;
  consentedAt: string;
}

export interface VehiclePhoto {
  angle: PhotoAngle;
  dataUrl: string;
  capturedAt: string;
  /** Driver or office marked this angle as new damage. */
  flaggedDamage?: boolean;
  damageNote?: string;
}

export type FuelLevel =
  | "full"
  | "three_quarter"
  | "half"
  | "quarter"
  | "empty";

export const FUEL_LEVEL_LABELS: Record<FuelLevel, string> = {
  full: "Full",
  three_quarter: "3/4",
  half: "1/2",
  quarter: "1/4",
  empty: "Empty",
};

export type MaintenanceLogType =
  | "oil_change"
  | "brakes"
  | "tires"
  | "battery"
  | "other";

export const MAINTENANCE_LOG_LABELS: Record<MaintenanceLogType, string> = {
  oil_change: "Oil Change",
  brakes: "Brakes",
  tires: "Tires",
  battery: "Battery",
  other: "Other",
};

export interface MaintenanceLogEntry {
  id: string;
  vehicleId: string;
  type: MaintenanceLogType;
  mileage: number;
  notes?: string;
  performedAt: string;
  createdBy: string;
  createdByName: string;
}

export interface TowEquipmentCheck {
  winchOperational: boolean;
  chainsSecure: boolean;
  lightsWorking: boolean;
  hydraulicFluidOk: boolean;
  notes?: string;
}

export interface CheckRecord {
  id: string;
  vehicleId: string;
  fleetId: string;
  driverId: string;
  driverName: string;
  type: CheckType;
  photos: VehiclePhoto[];
  startOdometer: number;
  endOdometer?: number;
  maintenanceIssues: MaintenanceIssue[];
  maintenanceNotes?: string;
  fuelReceiptUrl?: string;
  fuelLevel?: FuelLevel;
  towEquipmentCheck?: TowEquipmentCheck;
  conditionRating: ConditionRating;
  signatureDataUrl: string;
  notes?: string;
  overrideBy?: string;
  overrideReason?: string;
  knownIssueConsent?: KnownIssueConsent;
  synced: boolean;
  createdAt: string;
}

/** In-progress check saved locally for offline resume. */
export interface CheckInDraft {
  id: string;
  vehicleId: string;
  checkType: CheckType;
  driverId: string;
  step: number;
  photos: Partial<Record<PhotoAngle, string>>;
  startOdometer: string;
  endOdometer: string;
  issues: MaintenanceIssue[];
  maintenanceNotes: string;
  fuelReceipt: string;
  fuelLevel: FuelLevel | "";
  towCheck: TowEquipmentCheck;
  condition: ConditionRating;
  signature: string;
  notes: string;
  updatedAt: string;
}

export interface NotificationSettings {
  inAppAlertsEnabled: boolean;
  slackEnabled: boolean;
  slackRadCabEnabled: boolean;
  slackEquipmentEnabled: boolean;
  slackRadCabWebhookUrl?: string;
  slackEquipmentWebhookUrl?: string;
  slackRadCabChannelId?: string;
  slackEquipmentChannelId?: string;
  /** @deprecated Use channel-specific webhooks */
  slackWebhookUrl?: string;
  alertOnCheckInOut: boolean;
  emailEnabled: boolean;
  emailRecipients?: string[];
  alertOnPoorCondition: boolean;
  alertOnMaintenance: boolean;
  alertOnOutOfService: boolean;
}

export type AlertEventType =
  | "damage_reported"
  | "status_needs_work"
  | "status_out_of_service"
  | "known_issue_updated"
  | "check_in_completed"
  | "check_out_completed";

export interface FleetAlert {
  id: string;
  type: AlertEventType;
  message: string;
  vehicleId: string;
  vehiclePlate: string;
  actorName: string;
  createdAt: string;
  read: boolean;
}

export const ALERT_TYPE_LABELS: Record<AlertEventType, string> = {
  damage_reported: "Damage Reported",
  status_needs_work: "Needs Work",
  status_out_of_service: "Out of Service",
  known_issue_updated: "Known Issue",
  check_in_completed: "Check In",
  check_out_completed: "Check Out",
};

export interface AppSettings {
  id?: string;
  notificationSettings: NotificationSettings;
  companyName: string;
  /** Light office PIN for checkout-report review (MVP). */
  officePin?: string;
}

export const TIRE_HELPER =
  "Tire tread and wheel-well shots are hard — get as close as you can, keep it well-lit, and hold steady. Close enough is OK.";

export const WHEEL_HELPER =
  "Wheel-well and rim shots are hard — get close, keep the wheel centered, and hold steady. Close enough is OK.";

export const REGISTRATION_HELPER =
  "Office mainly needs the expiration date and VIN to be readable. The rest of the document can be imperfect.";

export const ODOMETER_HELPER =
  "Office mainly needs the mileage to be readable. Fuel and warning lights are a bonus.";

export const INTERIOR_NIGHT_HELPER =
  "At night, turn the interior lights on before you shoot.";

/** Tread is captured on Precheck, not as required photo slots. */
export const TIRE_TREAD_PHOTO_ANGLES: readonly PhotoAngle[] = [
  "lf_tire",
  "rf_tire",
  "rr_tire",
  "lr_tire",
];

export function isTireTreadPhotoAngle(angle: PhotoAngle): boolean {
  return (TIRE_TREAD_PHOTO_ANGLES as readonly PhotoAngle[]).includes(angle);
}

/** Driver walkaround — drops the four tire-tread slots. */
export function walkaroundPhotoSteps(steps: PhotoStep[] = PHOTO_ANGLES): PhotoStep[] {
  return steps.filter((step) => !isTireTreadPhotoAngle(step.angle));
}

/** Office/PDF: current walkaround plus any legacy tire photos still on the report. */
export function photoStepsForReport(
  steps: PhotoStep[],
  photos: Array<{ angle: PhotoAngle }>
): PhotoStep[] {
  const walkaround = walkaroundPhotoSteps(steps);
  const present = new Set(photos.map((photo) => photo.angle));
  const extras = PHOTO_ANGLES.filter(
    (step) => isTireTreadPhotoAngle(step.angle) && present.has(step.angle)
  );
  if (extras.length === 0) return walkaround;
  const keep = new Set(
    [...walkaround, ...extras].map((step) => step.angle)
  );
  return PHOTO_ANGLES.filter((step) => keep.has(step.angle));
}

/**
 * Default checkout walkaround (Rad Cab + generic_30).
 * Tire-tread slots stay in this list for old reports / labels, but
 * `walkaroundPhotoSteps` drops them from the required driver checklist (~26 shots).
 *
 * One clockwise lap grouped by physical station so the driver does not
 * circle the van twice (exteriors first, then a second interior lap):
 *
 *   1. Driver seat (already sitting) — odometer, windshield, radio, registration
 *   2. Driver door / left-front — interior in, door panels, LF fender/wheel/3/4
 *   3. Front
 *   4. Passenger front — RF cluster, passenger front interior, passenger doors
 *   5. Passenger rear — RR cluster, passenger rear interior
 *   6. Rear — straight-on rear, trunk/hatch
 *   7. Driver rear — LR cluster, driver rear interior
 *   8. Engine bay last (oil dipstick — keep oily hands off the rest of the walk)
 *
 * Example JPGs stay keyed by `angle` in photo-examples.ts (old filenames are fine).
 */
export const PHOTO_ANGLES: PhotoStep[] = [
  {
    angle: "odometer_fuel",
    label: "Odometer & Fuel",
    instruction: "From the driver seat — capture mileage, fuel, and warning lights.",
    icon: "🔢",
    category: "interior",
    required: true,
    helper: ODOMETER_HELPER,
  },
  {
    angle: "windshield",
    label: "Windshield",
    instruction: "Still in the driver seat — show windshield condition.",
    icon: "🪟",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "radio_climate",
    label: "Radio & Climate",
    instruction: "Still in the driver seat — photograph the radio and climate panel.",
    icon: "📻",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "registration",
    label: "Registration & Insurance",
    instruction: "Docs from the driver seat / visor / glove — date and VIN readable.",
    icon: "📄",
    category: "interior",
    required: true,
    helper: REGISTRATION_HELPER,
  },
  {
    angle: "driver_door_in",
    label: "Driver Door — Interior",
    instruction: "Step out, leave the driver door open, and photograph facing in.",
    icon: "🚪",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "driver_doors",
    label: "Driver Side Doors",
    instruction: "While at the driver side — both door panels, full length.",
    icon: "⬅️",
    category: "exterior",
    required: true,
  },
  {
    angle: "lf_fender",
    label: "LF Fender",
    instruction: "Still at the left-front — close-up of the LF fender.",
    icon: "🛡️",
    category: "detail",
    required: true,
  },
  {
    angle: "lf_tire",
    label: "LF Tire",
    instruction: "Show the condition of the left-front tire tread and sidewall.",
    icon: "🛞",
    category: "detail",
    required: false,
    helper: TIRE_HELPER,
  },
  {
    angle: "lf_wheel",
    label: "LF Wheel",
    instruction: "Show the condition of the left-front wheel and rim.",
    icon: "⭕",
    category: "detail",
    required: true,
    helper: WHEEL_HELPER,
  },
  {
    angle: "lf_corner",
    label: "Front 3/4 Left",
    instruction: "Step back at the left-front — show the whole LF 3/4.",
    icon: "↖️",
    category: "exterior",
    required: true,
  },
  {
    angle: "front",
    label: "Front",
    instruction: "Walk to the front — stand low, full bumper in frame.",
    icon: "⬆️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rf_corner",
    label: "Front 3/4 Right",
    instruction: "Continue clockwise to the right-front — whole RF 3/4.",
    icon: "↗️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rf_fender",
    label: "RF Fender",
    instruction: "Close-up of the right-front fender while you are there.",
    icon: "🛡️",
    category: "detail",
    required: true,
  },
  {
    angle: "rf_tire",
    label: "RF Tire",
    instruction: "Show the condition of the right-front tire.",
    icon: "🛞",
    category: "detail",
    required: false,
    helper: TIRE_HELPER,
  },
  {
    angle: "rf_wheel",
    label: "RF Wheel",
    instruction: "Show the condition of the right-front wheel and rim.",
    icon: "⭕",
    category: "detail",
    required: true,
    helper: WHEEL_HELPER,
  },
  {
    angle: "passenger_front_in",
    label: "Passenger Front Interior",
    instruction: "Open the front passenger door and photograph the interior.",
    icon: "💺",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "passenger_doors",
    label: "Passenger Doors",
    instruction: "While on the passenger side — both door panels, full length.",
    icon: "➡️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rr_quarter_panel",
    label: "RR Quarter Panel",
    instruction: "Walk to the right-rear — quarter panel close-up.",
    icon: "📐",
    category: "detail",
    required: true,
  },
  {
    angle: "rr_tire",
    label: "RR Tire",
    instruction: "Show the condition of the right-rear tire.",
    icon: "🛞",
    category: "detail",
    required: false,
    helper: TIRE_HELPER,
  },
  {
    angle: "rr_wheel",
    label: "RR Wheel",
    instruction: "Show the condition of the right-rear wheel and rim.",
    icon: "⭕",
    category: "detail",
    required: true,
    helper: WHEEL_HELPER,
  },
  {
    angle: "rr_corner",
    label: "Rear 3/4 Right",
    instruction: "Step back at the right-rear — whole RR 3/4.",
    icon: "↘️",
    category: "exterior",
    required: true,
  },
  {
    angle: "passenger_rear_in",
    label: "Passenger Rear Interior",
    instruction: "Open the passenger rear door and photograph the interior.",
    icon: "💺",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "rear",
    label: "Rear",
    instruction: "Straight-on rear — full bumper, lights, and hatch.",
    icon: "⬇️",
    category: "exterior",
    required: true,
  },
  {
    angle: "trunk_interior",
    label: "Trunk / Rear Hatch",
    instruction: "Open the trunk or hatch and photograph the cargo area.",
    icon: "📦",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "lr_corner",
    label: "Rear 3/4 Left",
    instruction: "Continue to the left-rear — whole LR 3/4.",
    icon: "↙️",
    category: "exterior",
    required: true,
  },
  {
    angle: "lr_quarter_panel",
    label: "LR Quarter Panel",
    instruction: "Close-up of the left-rear quarter panel while you are there.",
    icon: "📐",
    category: "detail",
    required: true,
  },
  {
    angle: "lr_tire",
    label: "LR Tire",
    instruction: "Show the condition of the left-rear tire.",
    icon: "🛞",
    category: "detail",
    required: false,
    helper: TIRE_HELPER,
  },
  {
    angle: "lr_wheel",
    label: "LR Wheel",
    instruction: "Show the condition of the left-rear wheel and rim.",
    icon: "⭕",
    category: "detail",
    required: true,
    helper: WHEEL_HELPER,
  },
  {
    angle: "driver_rear_door_in",
    label: "Driver Rear Door — Interior",
    instruction: "Open the driver-side rear door and photograph facing in.",
    icon: "🚪",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "engine_oil",
    label: "Engine Oil Level",
    instruction: "Last stop — hood up, dipstick with oil level visible.",
    icon: "🛢️",
    category: "detail",
    required: true,
  },
];

export interface MaintenanceIssueOption {
  id: MaintenanceIssue;
  label: string;
  description: string;
  icon: string;
}

export const MAINTENANCE_ISSUES: MaintenanceIssueOption[] = [
  {
    id: "low_tire",
    label: "Low Tire / Tire Pressure Light",
    description: "Tire looks low or TPMS light is on",
    icon: "🛞",
  },
  {
    id: "ac",
    label: "AC Not Working or Not Cooling",
    description: "Air conditioning weak, warm, or off",
    icon: "❄️",
  },
  {
    id: "noise",
    label: "Unusual Noise",
    description: "Grinding, squealing, knocking, or rattling",
    icon: "🔊",
  },
  {
    id: "dashboard_light",
    label: "Dashboard Warning Light",
    description: "Check engine or other warning on dash",
    icon: "⚠️",
  },
  {
    id: "brakes",
    label: "Brake Issue",
    description: "Soft pedal, pulling, or squeaking brakes",
    icon: "🛑",
  },
  {
    id: "other",
    label: "Other Damage or Issue",
    description: "Dents, scratches, or anything else",
    icon: "📝",
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  management: "Management",
  tech: "Tech",
  driver: "Driver",
};

export const FLEET_TYPE_LABELS: Record<FleetType, string> = {
  taxi: "Taxi",
  tow: "Tow Trucks",
  turo: "Turo",
  service_vehicle: "Service Vehicles",
};

export function fleetTypeLabel(type: StoredFleetType | string): string {
  return FLEET_TYPE_LABELS[normalizeFleetType(type)];
}

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  ready: "Ready",
  checked_out: "Checked Out",
  needs_work: "Needs Work",
  out_of_service: "Out of Service",
};

export const STATUS_COLORS: Record<VehicleStatus, string> = {
  ready: "bg-green-100 text-green-800",
  checked_out: "bg-blue-100 text-blue-800",
  needs_work: "bg-yellow-100 text-yellow-800",
  out_of_service: "bg-red-100 text-red-800",
};
