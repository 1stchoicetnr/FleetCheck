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
}

export interface UpsertVehicleInput {
  companyId: string;
  unitNumber?: string;
  plate: string;
  make: string;
  model: string;
  year: number;
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
