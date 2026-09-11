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
  createdAt: string;
}

export interface CheckoutReportInput {
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
