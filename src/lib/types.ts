export type UserRole = "super_admin" | "management" | "tech" | "driver";

export type FleetType =
  | "taxi"
  | "tow"
  | "turo"
  | "service_vehicle"
  | "camera_car"
  | "other";

export type VehicleStatus = "ready" | "needs_work" | "out_of_service";

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
  | "front_3_4_left"
  | "front"
  | "front_3_4_right"
  | "left_side"
  | "right_side"
  | "rear_3_4_left"
  | "rear"
  | "odometer"
  | "fuel_gauge";

export interface PhotoStep {
  angle: PhotoAngle;
  label: string;
  instruction: string;
  icon: string;
  category: "exterior" | "interior";
  required: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  fleetIds: string[];
}

export interface Fleet {
  id: string;
  name: string;
  type: FleetType;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  fleetId: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  status: VehicleStatus;
  lastMileage?: number;
  qrCode: string;
  createdAt: string;
}

export interface VehiclePhoto {
  angle: PhotoAngle;
  dataUrl: string;
  capturedAt: string;
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
  towEquipmentCheck?: TowEquipmentCheck;
  conditionRating: ConditionRating;
  signatureDataUrl: string;
  notes?: string;
  overrideBy?: string;
  overrideReason?: string;
  synced: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  emailEnabled: boolean;
  emailRecipients?: string[];
  alertOnPoorCondition: boolean;
  alertOnMaintenance: boolean;
  alertOnOutOfService: boolean;
}

export interface AppSettings {
  id?: string;
  notificationSettings: NotificationSettings;
  companyName: string;
}

export const PHOTO_ANGLES: PhotoStep[] = [
  {
    angle: "front_3_4_left",
    label: "Front 3/4 Left",
    instruction: "Stand at the front-left corner. Show the whole front and left side.",
    icon: "↖️",
    category: "exterior",
    required: true,
  },
  {
    angle: "front",
    label: "Front",
    instruction: "Stand directly in front of the vehicle. Capture the full front.",
    icon: "⬆️",
    category: "exterior",
    required: true,
  },
  {
    angle: "front_3_4_right",
    label: "Front 3/4 Right",
    instruction: "Stand at the front-right corner. Show the whole front and right side.",
    icon: "↗️",
    category: "exterior",
    required: true,
  },
  {
    angle: "left_side",
    label: "Left Side",
    instruction: "Stand on the driver side. Capture the full left profile.",
    icon: "⬅️",
    category: "exterior",
    required: true,
  },
  {
    angle: "right_side",
    label: "Right Side",
    instruction: "Stand on the passenger side. Capture the full right profile.",
    icon: "➡️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rear_3_4_left",
    label: "Rear 3/4 Left",
    instruction: "Stand at the rear-left corner. Show the whole rear and left side.",
    icon: "↙️",
    category: "exterior",
    required: true,
  },
  {
    angle: "rear",
    label: "Rear",
    instruction: "Stand directly behind the vehicle. Capture the full rear.",
    icon: "⬇️",
    category: "exterior",
    required: true,
  },
  {
    angle: "odometer",
    label: "Odometer",
    instruction: "Sit in the driver seat. Take a clear photo of the mileage reading.",
    icon: "🔢",
    category: "interior",
    required: true,
  },
  {
    angle: "fuel_gauge",
    label: "Fuel Gauge",
    instruction: "Photo the fuel gauge so the level is easy to read.",
    icon: "⛽",
    category: "interior",
    required: true,
  },
];

export const MAINTENANCE_ISSUES: { id: MaintenanceIssue; label: string }[] = [
  { id: "low_tire", label: "Low Tire Pressure" },
  { id: "ac", label: "AC Not Working" },
  { id: "noise", label: "Unusual Noise" },
  { id: "dashboard_light", label: "Dashboard Warning Light" },
  { id: "brakes", label: "Brake Issue" },
  { id: "other", label: "Other Issue" },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  management: "Management",
  tech: "Tech",
  driver: "Driver",
};

export const FLEET_TYPE_LABELS: Record<FleetType, string> = {
  taxi: "Taxi",
  tow: "Tow Truck",
  turo: "Turo",
  service_vehicle: "Service Vehicle",
  camera_car: "Camera Car",
  other: "Other",
};

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  ready: "Ready",
  needs_work: "Needs Work",
  out_of_service: "Out of Service",
};

export const STATUS_COLORS: Record<VehicleStatus, string> = {
  ready: "bg-green-100 text-green-800",
  needs_work: "bg-yellow-100 text-yellow-800",
  out_of_service: "bg-red-100 text-red-800",
};
