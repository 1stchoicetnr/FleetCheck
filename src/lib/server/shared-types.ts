import type { CheckoutInspectionForm, Powertrain } from "@/lib/inspection-form";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  CheckoutType,
  Company,
  PhotoAngle,
  VehiclePhoto,
} from "@/lib/types";

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

export interface SharedStore {
  companies: Company[];
  vehicles: SharedVehicle[];
  reports: CheckoutReport[];
}

export type { CheckoutReport, Company, VehiclePhoto };
