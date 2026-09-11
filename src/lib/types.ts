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
  /** exterior = full vehicle (landscape); detail = close-up; interior = cabin */
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
  year: number;
  make: string;
  model: string;
  odometer: number;
  driverName: string;
  dispatcherName: string;
  type: CheckoutType;
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

/**
 * Default ~30-slot checkout walkaround (Rad Cab + generic_30).
 *
 * Physical path a driver walks — do not scatter corners / wheels:
 *   1–4   Docs from the driver seat: odometer, registration, windshield, radio
 *   5–8   Start at LF corner; shoot fender + tire + wheel as you stand there
 *   9     Straight-on front, then walk clockwise
 *   10–13 RF corner cluster (corner, fender, tire, wheel)
 *   14    Passenger doors (RAD CAB logo / full panels)
 *   15–18 RR cluster (quarter, tire, wheel, corner)
 *   19    Straight-on rear
 *   20–23 LR cluster (corner, quarter, tire, wheel)
 *   24    Driver-side doors — back at the start side
 *   25–29 Interiors: driver door in → rear seats → trunk → passenger
 *   30    Engine bay last (oil)
 *
 * Example JPGs stay keyed by `angle` in photo-examples.ts (old filenames are fine).
 */
export const PHOTO_ANGLES: PhotoStep[] = [
  {
    angle: "odometer_fuel",
    label: "Odometer & Fuel",
    instruction: "Capture mileage, fuel level, and any warning lights on the dash.",
    icon: "🔢",
    category: "interior",
    required: true,
    helper: ODOMETER_HELPER,
  },
  {
    angle: "registration",
    label: "Registration & Insurance",
    instruction: "Clear photo of the registration and insurance documents.",
    icon: "📄",
    category: "interior",
    required: true,
    helper: REGISTRATION_HELPER,
  },
  {
    angle: "windshield",
    label: "Windshield",
    instruction: "From the driver seat — show windshield condition.",
    icon: "🪟",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "radio_climate",
    label: "Radio & Climate",
    instruction: "Photograph the radio and climate control panel.",
    icon: "📻",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "lf_corner",
    label: "Front 3/4 Left",
    instruction: "Show the whole left-front (LF) of the vehicle.",
    icon: "↖️",
    category: "exterior",
    required: true,
  },
  {
    angle: "lf_fender",
    label: "LF Fender",
    instruction: "Close-up of the left-front fender condition.",
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
    required: true,
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
    angle: "front",
    label: "Front",
    instruction: "Stand low — show the full front including the lower bumper.",
    icon: "⬆️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rf_corner",
    label: "Front 3/4 Right",
    instruction: "Show the whole right-front (RF) of the vehicle.",
    icon: "↗️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rf_fender",
    label: "RF Fender",
    instruction: "Close-up of the right-front fender condition.",
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
    required: true,
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
    angle: "passenger_doors",
    label: "Passenger Doors",
    instruction: "Capture both passenger-side doors — full door panels visible.",
    icon: "➡️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rr_quarter_panel",
    label: "RR Quarter Panel",
    instruction: "Show the right-rear quarter panel condition.",
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
    required: true,
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
    instruction: "Show the whole right-rear (RR) of the vehicle.",
    icon: "↘️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rear",
    label: "Rear",
    instruction: "Straight-on rear view — show the full rear of the vehicle.",
    icon: "⬇️",
    category: "exterior",
    required: true,
  },
  {
    angle: "lr_corner",
    label: "Rear 3/4 Left",
    instruction: "Show the whole left-rear (LR) of the vehicle.",
    icon: "↙️",
    category: "exterior",
    required: true,
  },
  {
    angle: "lr_quarter_panel",
    label: "LR Quarter Panel",
    instruction: "Show the left-rear quarter panel condition.",
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
    required: true,
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
    angle: "driver_doors",
    label: "Driver Side Doors",
    instruction: "Capture both driver-side doors — full door panels visible.",
    icon: "⬅️",
    category: "exterior",
    required: true,
  },
  {
    angle: "driver_door_in",
    label: "Driver Door — Interior",
    instruction: "Open the driver door and photograph facing in.",
    icon: "🚪",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
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
    angle: "trunk_interior",
    label: "Trunk / Rear Hatch",
    instruction: "Photograph the inside of the trunk or rear hatch area.",
    icon: "📦",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
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
    angle: "passenger_front_in",
    label: "Passenger Front Interior",
    instruction: "Photograph the front passenger area from the open door.",
    icon: "💺",
    category: "interior",
    required: true,
    helper: INTERIOR_NIGHT_HELPER,
  },
  {
    angle: "engine_oil",
    label: "Engine Oil Level",
    instruction: "Show the dipstick with the engine oil level visible.",
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
