import type { CheckoutInspectionForm, Powertrain } from "@/lib/inspection-form";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  CheckoutType,
  Company,
  PhotoAngle,
  VehicleKnownIssue,
  VehiclePhoto,
} from "@/lib/types";
import type { FleetSettings } from "@/lib/fleet-settings";
import type { UserRole } from "@/lib/types";
import type { StoredFeedback } from "@/lib/feedback";

export interface SharedFleet {
  id: string;
  name: string;
  type: string;
  companyId: string;
  archivedAt?: string;
  createdAt: string;
}

export interface SharedVehicle {
  id: string;
  companyId: string;
  fleetId?: string;
  unitNumber: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  lastMileage?: number;
  /** ISO timestamp when Office archived the unit. Absent = active. */
  archivedAt?: string;
  /** Explicit powertrain. If omitted, inferred from make/model. */
  powertrain?: Powertrain;
  lastOilChangeMileage?: number;
  knownIssue?: VehicleKnownIssue;
  createdAt: string;
}

export interface ListVehiclesOptions {
  includeArchived?: boolean;
}

export interface CheckoutReportInput {
  companyId: string;
  vehicleId: string;
  unitNumber: string;
  plate?: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  driverName: string;
  /** Taken from the session. A client-sent value is ignored. */
  driverUserId?: string;
  dispatcherName: string;
  type: CheckoutType;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
  /** Stable client key. A replay returns the original report and does not notify again. */
  idempotencyKey?: string;
}

export interface UpsertVehicleInput {
  companyId: string;
  fleetId?: string;
  unitNumber?: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  powertrain?: Powertrain;
}

export interface CheckoutReviewInput {
  reviewStatus: CheckoutReviewStatus;
  reviewNotes?: string;
  newDamageNotes?: string;
  retakeAngles?: PhotoAngle[];
  reviewedBy: string;
}

export interface SharedOfficeAlert {
  id: string;
  type:
    | "damage_reported"
    | "status_needs_work"
    | "status_out_of_service"
    | "repeat_problem";
  message: string;
  vehicleId: string;
  vehiclePlate: string;
  actorName: string;
  reportId?: string;
  createdAt: string;
  read: boolean;
  archivedAt?: string;
}

export interface SharedAppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface SharedStore {
  companies: Company[];
  fleets?: SharedFleet[];
  vehicles: SharedVehicle[];
  reports: CheckoutReport[];
  alerts?: SharedOfficeAlert[];
  users?: SharedAppUser[];
  settings?: FleetSettings;
  companySettings?: unknown;
  feedback?: StoredFeedback[];
  /** Set after the one-time rollout archive. A second boot does not archive again. */
  rolloutSlateAt?: string;
}

export type { FleetSettings, CheckoutReport, Company, VehiclePhoto };
