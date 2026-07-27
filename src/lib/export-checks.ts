import { CheckRecord, Vehicle, FUEL_LEVEL_LABELS } from "./types";
import { formatDate, formatMileage, formatVehicleSlackLabel } from "./utils";

export function checksToCsv(
  checks: CheckRecord[],
  vehicles: Record<string, Vehicle>
): string {
  const headers = [
    "Date",
    "Type",
    "Vehicle",
    "Plate",
    "Driver",
    "Start Odometer",
    "End Odometer",
    "Fuel Level",
    "Condition",
    "Notes",
    "Maintenance Notes",
  ];
  const rows = checks.map((c) => {
    const v = vehicles[c.vehicleId];
    const vehicleLabel = v ? formatVehicleSlackLabel(v) : c.vehicleId;
    return [
      formatDate(c.createdAt),
      c.type === "check_in" ? "Check In" : "Check Out",
      vehicleLabel,
      v?.plate ?? "",
      c.driverName,
      String(c.startOdometer),
      c.endOdometer != null ? String(c.endOdometer) : "",
      FUEL_LEVEL_LABELS[c.fuelLevel ?? "full"] ?? c.fuelLevel ?? "",
      c.conditionRating,
      (c.notes ?? "").replace(/"/g, '""'),
      (c.maintenanceNotes ?? "").replace(/"/g, '""'),
    ]
      .map((cell) => `"${cell}"`)
      .join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
