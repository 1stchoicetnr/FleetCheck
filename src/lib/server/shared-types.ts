import type { CheckoutInspectionForm, Powertrain } from "@/lib/inspection-form";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  CheckoutType,
  Company,
  PhotoAngle,
  VehiclePhoto,
} from "@/lib/types";
import type { FleetSettings } from "@/lib/fleet-settings";

export interface SharedVehicle {
  id: string;
  companyId: string;
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
  dispatcherName: string;
  type: CheckoutType;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
}

export interface UpsertVehicleInput {
  companyId: string;
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
  type: "damage_reported" | "status_needs_work" | "status_out_of_service";
  message: string;
  vehicleId: string;
  vehiclePlate: string;
  actorName: string;
  reportId?: string;
  createdAt: string;
  read: boolean;
  archivedAt?: string;
}

export interface SharedStore {
  companies: Company[];
  vehicles: SharedVehicle[];
  reports: CheckoutReport[];
  alerts?: SharedOfficeAlert[];
  settings?: FleetSettings;
}

export type { FleetSettings, CheckoutReport, Company, VehiclePhoto };
