import { PHOTO_EXAMPLE_PATHS } from "@/lib/photo-examples";
import {
  FIRST_CHOICE_COMPANY_ID,
  OTHER_FLEETS_COMPANY_ID,
  PINKIE_TOW_COMPANY_ID,
  RAD_CAB_COMPANY_ID,
  SEEDED_COMPANIES,
} from "@/lib/companies";
import {
  CheckoutInspectionForm,
  createEmptyInspectionForm,
} from "@/lib/inspection-form";
import { CheckoutReport, PHOTO_ANGLES, VehiclePhoto } from "@/lib/types";
import { SharedVehicle } from "./shared-types";

export const RAD_CAB_UNIT_12_ID = "vehicle-radcab-12";
export const RAD_CAB_UNIT_18_ID = "vehicle-radcab-18";
export const RAD_CAB_UNIT_23_ID = "vehicle-radcab-23";
export const RAD_CAB_UNIT_CXB9373_ID = "vehicle-radcab-cxb9373";
export const RAD_CAB_UNIT_091_ID = "vehicle-radcab-091";
export const FIRST_CHOICE_UNIT_T1_ID = "vehicle-1st-t1";

function checkedForm(
  powertrain: "gas" | "ev",
  extras?: Partial<CheckoutInspectionForm>
): CheckoutInspectionForm {
  const form = createEmptyInspectionForm(powertrain);
  for (const id of Object.keys(form.checks) as Array<keyof typeof form.checks>) {
    if (form.checks[id].na) continue;
    form.checks[id] = { ...form.checks[id], checked: true };
  }
  return {
    ...form,
    interiorClean: "yes",
    exteriorClean: "yes",
    ...extras,
    checks: {
      ...form.checks,
      ...extras?.checks,
    },
  };
}

function examplePhotos(capturedAt: string): VehiclePhoto[] {
  return PHOTO_ANGLES.map((step) => ({
    angle: step.angle,
    dataUrl: PHOTO_EXAMPLE_PATHS[step.angle],
    capturedAt,
  }));
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function sharedSeedVehicles(): SharedVehicle[] {
  const now = "2024-01-01T00:00:00.000Z";
  return [
    {
      id: RAD_CAB_UNIT_12_ID,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "12",
      plate: "RC-0012",
      make: "Dodge",
      model: "Grand Caravan",
      year: 2014,
      lastMileage: 128440,
      powertrain: "gas",
      createdAt: now,
    },
    {
      id: RAD_CAB_UNIT_18_ID,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "18",
      plate: "RC-0018",
      make: "Dodge",
      model: "Grand Caravan",
      year: 2018,
      lastMileage: 87210,
      powertrain: "gas",
      createdAt: now,
    },
    {
      id: RAD_CAB_UNIT_23_ID,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "23",
      plate: "ABC-1234",
      make: "Toyota",
      model: "Camry",
      year: 2022,
      lastMileage: 45230,
      powertrain: "gas",
      createdAt: now,
    },
    {
      id: RAD_CAB_UNIT_091_ID,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "091",
      plate: "EV-0091",
      make: "Tesla",
      model: "Model Y",
      year: 2024,
      lastMileage: 55280,
      powertrain: "ev",
      createdAt: now,
    },
    {
      id: RAD_CAB_UNIT_CXB9373_ID,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "CXB9373",
      plate: "CXB9373",
      make: "Dodge",
      model: "Grand Caravan",
      year: 2011,
      powertrain: "gas",
      createdAt: now,
    },
    {
      id: FIRST_CHOICE_UNIT_T1_ID,
      companyId: FIRST_CHOICE_COMPANY_ID,
      unitNumber: "T1",
      plate: "TOW-5678",
      make: "Ford",
      model: "F-550",
      year: 2021,
      lastMileage: 78450,
      powertrain: "gas",
      createdAt: now,
    },
    {
      id: "vehicle-other-9012",
      companyId: OTHER_FLEETS_COMPANY_ID,
      unitNumber: "9012",
      plate: "TUR-9012",
      make: "Honda",
      model: "CR-V",
      year: 2023,
      lastMileage: 22100,
      powertrain: "gas",
      createdAt: now,
    },
    {
      id: "vehicle-pinkie-placeholder",
      companyId: PINKIE_TOW_COMPANY_ID,
      unitNumber: "P1",
      plate: "PNK-0001",
      make: "Ford",
      model: "F-450",
      year: 2019,
      lastMileage: 61000,
      powertrain: "gas",
      createdAt: now,
    },
  ];
}

function teslaPaperExampleReport(): CheckoutReport {
  const completedAt = "2024-09-10T16:00:00.000Z";
  return {
    id: "cr-seed-unit091-paper-example",
    companyId: RAD_CAB_COMPANY_ID,
    vehicleId: RAD_CAB_UNIT_091_ID,
    unitNumber: "091",
    plate: "EV-0091",
    year: 2024,
    make: "Tesla",
    model: "Model Y",
    odometer: 55280,
    driverName: "KEN",
    dispatcherName: "Ashley",
    type: "check_out",
    photos: examplePhotos(completedAt),
    status: "complete",
    completedAt,
    reviewStatus: "pending",
    inspectionForm: checkedForm("ev", {
      cloverNumber: "091",
      inspectedAt: completedAt,
      checks: {
        ...checkedForm("ev").checks,
        tirePressure: { checked: true, note: "35 Psi" },
      },
      interiorClean: "yes",
      exteriorClean: "yes",
      damage: { right: "SCRATCHES", marks: ["right"] },
      additionalComments: "Right-side bumper scratches circled on paper form.",
    }),
    flagged: true,
    synced: true,
    createdAt: completedAt,
  };
}

/** Slack PDFs are not Office records. This backfills Nathan's missing CXB9373 CR. */
export function sharedRecoveredReports(): CheckoutReport[] {
  const completedAt = "2026-09-11T11:46:05.237Z";
  return [
    teslaPaperExampleReport(),
    {
      id: "cr-slack-cxb9373-1789127165237",
      companyId: RAD_CAB_COMPANY_ID,
      vehicleId: RAD_CAB_UNIT_CXB9373_ID,
      unitNumber: "CXB9373",
      plate: "CXB9373",
      year: 2011,
      make: "Dodge",
      model: "Grand Caravan",
      odometer: 134122,
      driverName: "James",
      dispatcherName: "Nathan",
      type: "check_in",
      photos: [],
      status: "complete",
      completedAt,
      reviewStatus: "pending",
      reviewNotes:
        "Recovered from Slack PDF fleetcheck-CXB9373-1789127165237.pdf. Photos and signature were not stored on the server.",
      flagged: true,
      synced: true,
      createdAt: completedAt,
    },
  ];
}

export function sharedSeedReports(): CheckoutReport[] {
  const older = daysAgo(14);
  const recent = daysAgo(7);
  const pendingAt = daysAgo(1);

  return [
    {
      id: "cr-seed-unit12-prior-2",
      companyId: RAD_CAB_COMPANY_ID,
      vehicleId: RAD_CAB_UNIT_12_ID,
      unitNumber: "12",
      year: 2014,
      make: "Dodge",
      model: "Grand Caravan",
      odometer: 127890,
      driverName: "Maria Santos",
      dispatcherName: "Ashley",
      type: "check_out",
      photos: examplePhotos(older),
      status: "complete",
      completedAt: older,
      reviewStatus: "pass",
      inspectionForm: checkedForm("gas", {
        cloverNumber: "12",
        inspectedAt: older,
        checks: {
          ...checkedForm("gas").checks,
          tirePressure: { checked: true, note: "35 Psi" },
        },
      }),
      reviewNotes: "No new damage vs prior.",
      reviewedAt: older,
      reviewedBy: "Ashley",
      flagged: false,
      synced: true,
      createdAt: older,
    },
    {
      id: "cr-seed-unit12-prior-1",
      companyId: RAD_CAB_COMPANY_ID,
      vehicleId: RAD_CAB_UNIT_12_ID,
      unitNumber: "12",
      year: 2014,
      make: "Dodge",
      model: "Grand Caravan",
      odometer: 128210,
      driverName: "Luis Ortega",
      dispatcherName: "James",
      type: "check_in",
      photos: examplePhotos(recent),
      status: "complete",
      completedAt: recent,
      reviewStatus: "pass",
      inspectionForm: checkedForm("gas", {
        cloverNumber: "12",
        inspectedAt: recent,
        checks: {
          ...checkedForm("gas").checks,
          tirePressure: { checked: true, note: "35 Psi" },
        },
        damage: { left: "Same scuff on LF bumper", marks: ["left"] },
      }),
      reviewNotes: "Same scuff on LF bumper as last report.",
      reviewedAt: recent,
      reviewedBy: "Ashley",
      flagged: false,
      synced: true,
      createdAt: recent,
    },
    {
      id: "cr-seed-unit18-pending",
      companyId: RAD_CAB_COMPANY_ID,
      vehicleId: RAD_CAB_UNIT_18_ID,
      unitNumber: "18",
      year: 2018,
      make: "Dodge",
      model: "Grand Caravan",
      odometer: 87210,
      driverName: "Driver",
      dispatcherName: "Ashley",
      type: "check_out",
      photos: examplePhotos(pendingAt),
      status: "complete",
      completedAt: pendingAt,
      reviewStatus: "pending",
      inspectionForm: checkedForm("gas", {
        cloverNumber: "18",
        inspectedAt: pendingAt,
        checks: {
          ...checkedForm("gas").checks,
          tirePressure: { checked: true, note: "35 Psi" },
        },
      }),
      flagged: false,
      synced: true,
      createdAt: pendingAt,
    },
    teslaPaperExampleReport(),
  ];
}

export { SEEDED_COMPANIES };
