import jsPDF from "jspdf";
import {
  CheckRecord,
  Fleet,
  MAINTENANCE_ISSUES,
  PHOTO_ANGLES,
  Vehicle,
} from "./types";
import { formatDate, formatMileage } from "./utils";

export async function generateCheckPDF(
  check: CheckRecord,
  vehicle: Vehicle,
  fleet: Fleet
): Promise<Blob> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FleetCheck Report", pageWidth / 2, y, { align: "center" });
  y += 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 15;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Vehicle Information", 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const vehicleInfo = [
    `Plate: ${vehicle.plate}`,
    `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    `Fleet: ${fleet.name} (${fleet.type})`,
    `Check Type: ${check.type === "check_in" ? "Check In" : "Check Out"}`,
    `Driver: ${check.driverName}`,
    `Date: ${formatDate(check.createdAt)}`,
  ];
  for (const line of vehicleInfo) {
    doc.text(line, 14, y);
    y += 6;
  }
  y += 5;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Mileage", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Start Odometer: ${formatMileage(check.startOdometer)}`, 14, y);
  y += 6;
  if (check.endOdometer) {
    doc.text(`End Odometer: ${formatMileage(check.endOdometer)}`, 14, y);
    y += 6;
    doc.text(
      `Distance: ${formatMileage(check.endOdometer - check.startOdometer)}`,
      14,
      y
    );
    y += 6;
  }
  y += 5;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Condition: ${check.conditionRating.toUpperCase()}`, 14, y);
  y += 10;

  if (check.maintenanceIssues.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Reported Issues", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const issue of check.maintenanceIssues) {
      const label =
        MAINTENANCE_ISSUES.find((m) => m.id === issue)?.label ?? issue;
      doc.text(`• ${label}`, 18, y);
      y += 6;
    }
    if (check.maintenanceNotes) {
      y += 2;
      doc.text(`Notes: ${check.maintenanceNotes}`, 14, y);
      y += 6;
    }
    y += 5;
  }

  if (check.towEquipmentCheck) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Tow Equipment Check", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const te = check.towEquipmentCheck;
    doc.text(`Winch Operational: ${te.winchOperational ? "Yes" : "No"}`, 14, y);
    y += 6;
    doc.text(`Chains Secure: ${te.chainsSecure ? "Yes" : "No"}`, 14, y);
    y += 6;
    doc.text(`Lights Working: ${te.lightsWorking ? "Yes" : "No"}`, 14, y);
    y += 6;
    doc.text(`Hydraulic Fluid OK: ${te.hydraulicFluidOk ? "Yes" : "No"}`, 14, y);
    y += 10;
  }

  if (check.notes) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Additional Notes", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const splitNotes = doc.splitTextToSize(check.notes, pageWidth - 28);
    doc.text(splitNotes, 14, y);
    y += splitNotes.length * 6 + 5;
  }

  // Signature
  if (check.signatureDataUrl) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Driver Signature", 14, y);
    y += 5;
    try {
      doc.addImage(check.signatureDataUrl, "PNG", 14, y, 80, 30);
      y += 35;
    } catch {
      doc.text("[Signature captured]", 14, y);
      y += 10;
    }
  }

  // Photos on new pages
  const photos = check.photos.filter((p) => p.dataUrl);
  if (photos.length > 0) {
    doc.addPage();
    y = 20;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Vehicle Photos", 14, y);
    y += 10;

    let col = 0;
    for (const photo of photos) {
      const label =
        PHOTO_ANGLES.find((a) => a.angle === photo.angle)?.label ?? photo.angle;
      if (y > 240) {
        doc.addPage();
        y = 20;
        col = 0;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(label, 14 + col * 95, y);
      try {
        doc.addImage(photo.dataUrl, "JPEG", 14 + col * 95, y + 3, 85, 60);
      } catch {
        doc.text("[Photo]", 14 + col * 95, y + 30);
      }
      col++;
      if (col >= 2) {
        col = 0;
        y += 70;
      }
    }
  }

  return doc.output("blob");
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
