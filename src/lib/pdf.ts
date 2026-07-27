import jsPDF from "jspdf";
import {
  CheckRecord,
  Fleet,
  MAINTENANCE_ISSUES,
  PHOTO_ANGLES,
  Vehicle,
  FUEL_LEVEL_LABELS,
  fleetTypeLabel,
} from "./types";
import { formatDate, formatMileage, fitInBox, getImageDimensions } from "./utils";

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
    `Fleet: ${fleet.name} (${fleetTypeLabel(fleet.type)})`,
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

  if (check.fuelLevel) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Fuel Level", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(FUEL_LEVEL_LABELS[check.fuelLevel], 14, y);
    y += 10;
  }

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

  if (check.fuelReceiptUrl) {
    if (y > 200) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Fuel Receipt", 14, y);
    y += 5;
    try {
      doc.addImage(check.fuelReceiptUrl, "JPEG", 14, y, 80, 60);
      y += 65;
    } catch {
      doc.text("[Fuel receipt attached]", 14, y);
      y += 10;
    }
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

  if (check.knownIssueConsent) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Known Issue Consent", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const consent = check.knownIssueConsent;
    doc.text(`Driver: ${consent.driverName}`, 14, y);
    y += 6;
    doc.text(`Consented: ${formatDate(consent.consentedAt)}`, 14, y);
    y += 6;
    const splitIssue = doc.splitTextToSize(
      `Issue acknowledged: ${consent.issueText}`,
      pageWidth - 28
    );
    doc.text(splitIssue, 14, y);
    y += splitIssue.length * 6 + 5;
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
    let rowMaxH = 0;
    for (const photo of photos) {
      const label =
        PHOTO_ANGLES.find((a) => a.angle === photo.angle)?.label ?? photo.angle;
      if (y > 240) {
        doc.addPage();
        y = 20;
        col = 0;
        rowMaxH = 0;
      }
      const x = 14 + col * 95;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(label, x, y);
      try {
        const { width: imgW, height: imgH } = await getImageDimensions(
          photo.dataUrl
        );
        const { width, height } = fitInBox(imgW, imgH, 85, 60);
        const imgY = y + 3 + (60 - height) / 2;
        doc.addImage(photo.dataUrl, "JPEG", x, imgY, width, height);
        rowMaxH = Math.max(rowMaxH, 60);
      } catch {
        doc.text("[Photo]", x, y + 30);
        rowMaxH = Math.max(rowMaxH, 60);
      }
      col++;
      if (col >= 2) {
        col = 0;
        y += rowMaxH + 10;
        rowMaxH = 0;
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
