import jsPDF from "jspdf";
import {
  CheckRecord,
  CheckoutReport,
  CHECKOUT_REVIEW_LABELS,
  Fleet,
  MAINTENANCE_ISSUES,
  PHOTO_ANGLES,
  PhotoAngle,
  PhotoStep,
  Vehicle,
  FUEL_LEVEL_LABELS,
  fleetTypeLabel,
} from "./types";
import {
  formatDate,
  formatDateOnly,
  formatMileage,
  formatUnitLabel,
  fitInBox,
  getImageDimensions,
} from "./utils";
import {
  flaggedDamageAngles,
  isPhotoDamageFlagged,
  photoAngleLabel,
  sortAnglesDamageFirst,
} from "./photo-flags";
import { inspectionFormSummaryLines } from "./inspection-form";

export type CheckoutPdfOptions = {
  companyName?: string;
  plate?: string;
  steps?: PhotoStep[];
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(blob);
  });
}

function normalizePdfImageDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/")) return dataUrl;
  return dataUrl.replace(/^data:[^;,]*/, "data:image/jpeg");
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load photo (${res.status})`);
  }
  const blob = await res.blob();
  return normalizePdfImageDataUrl(await blobToDataUrl(blob));
}

async function resolvePdfPhoto(
  src: string,
  proxyUrl?: string
): Promise<string> {
  if (src.startsWith("data:")) return src;
  try {
    return await fetchAsDataUrl(src);
  } catch {
    if (proxyUrl && proxyUrl !== src) {
      return await fetchAsDataUrl(proxyUrl);
    }
    throw new Error("Could not load photo");
  }
}

function pdfImageFormat(dataUrl: string): "JPEG" | "PNG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

export function checkoutReportPdfFilename(
  report: CheckoutReport,
  plate?: string
): string {
  const raw = plate || report.plate || report.unitNumber || "report";
  const slug = raw.replace(/[^\w]+/g, "").toUpperCase() || "REPORT";
  const when = Date.parse(report.completedAt);
  const stamp = Number.isFinite(when) ? String(when) : String(Date.now());
  return `fleetcheck-${slug}-${stamp}.pdf`;
}

function checkoutPhotoProxyUrl(reportId: string, angle: PhotoAngle): string {
  return `/api/checkout-reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(angle)}`;
}

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

export async function generateCheckoutReportPDF(
  report: CheckoutReport,
  options: CheckoutPdfOptions = {}
): Promise<Blob> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const plate = options.plate ?? report.plate;
  const steps = options.steps?.length ? options.steps : PHOTO_ANGLES;
  const photoMap = Object.fromEntries(
    report.photos.filter((p) => p.dataUrl).map((p) => [p.angle, p])
  );
  const listed = steps.map((step) => ({
    angle: step.angle,
    label: step.label,
    photo: photoMap[step.angle],
  }));
  const listedAngles = new Set(listed.map((item) => item.angle));
  for (const photo of report.photos) {
    if (!photo.dataUrl || listedAngles.has(photo.angle)) continue;
    listed.push({
      angle: photo.angle,
      label:
        PHOTO_ANGLES.find((step) => step.angle === photo.angle)?.label ??
        photo.angle,
      photo,
    });
  }
  const ordered = sortAnglesDamageFirst(listed, report.photos);
  const present = ordered.filter((item) => item.photo?.dataUrl);

  let y = 20;
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FleetCheck Checkout Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Inspection form + picture report", pageWidth / 2, y, {
    align: "center",
  });
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Completed: ${formatDate(report.completedAt)}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 12;

  const addWrapped = (text: string, indent = 14) => {
    const lines = doc.splitTextToSize(text, pageWidth - indent - 14);
    if (y + lines.length * 6 > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, indent, y);
    y += lines.length * 6;
  };

  const section = (title: string) => {
    if (y > pageHeight - 36) {
      doc.addPage();
      y = 20;
    }
    y += 2;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
  };

  section("Inspection form");
  const formLines = [
    `Date: ${formatDateOnly(report.inspectionForm?.inspectedAt || report.completedAt)}`,
    `Name: ${report.driverName}`,
    `Vehicle: ${report.year} ${report.make} ${report.model}`,
    `Unit / Clover #: ${report.inspectionForm?.cloverNumber || report.unitNumber}`,
    `Company: ${options.companyName || "—"}`,
    `Plate: ${plate || "—"}`,
    `Type: ${report.type === "check_in" ? "Check In" : "Check Out"}`,
    `Odometer start: ${formatMileage(report.odometer)}`,
    `Dispatcher: ${report.dispatcherName}`,
    `Completed: ${formatDate(report.completedAt)}`,
    `Photos: ${present.length} of ${listed.length}`,
    `Office id: ${report.id}`,
  ];
  for (const line of formLines) addWrapped(line);

  section("Walkaround checklist");
  if (report.inspectionForm) {
    for (const line of inspectionFormSummaryLines(report.inspectionForm)) {
      addWrapped(line);
    }
  } else {
    addWrapped("No paper checklist on this report (submitted before the form was added).");
  }

  section("Office review");
  addWrapped(`Status: ${CHECKOUT_REVIEW_LABELS[report.reviewStatus]}`);
  if (report.reviewedAt) {
    addWrapped(
      `Reviewed: ${formatDate(report.reviewedAt)}${
        report.reviewedBy ? ` by ${report.reviewedBy}` : ""
      }`
    );
  }
  if (report.reviewNotes) addWrapped(`Review notes: ${report.reviewNotes}`);
  if (report.newDamageNotes) {
    addWrapped(`New damage vs prior: ${report.newDamageNotes}`);
  }
  if (report.retakeAngles?.length) {
    const labels = report.retakeAngles.map(
      (angle) =>
        PHOTO_ANGLES.find((step) => step.angle === angle)?.label ?? angle
    );
    addWrapped(`Retake requested: ${labels.join(", ")}`);
  }
  if (report.flagged) addWrapped("Flag queue: yes");
  const damageAngles = flaggedDamageAngles(report);
  if (damageAngles.length) {
    addWrapped(
      `DAMAGE flagged: ${damageAngles.map(photoAngleLabel).join(", ")}`
    );
  }

  if (report.signatureDataUrl) {
    section("Driver signature");
    addWrapped(`Signed by ${report.driverName}${report.signedAt ? ` · ${formatDate(report.signedAt)}` : ""}`);
    try {
      const { width: sigW, height: sigH } = await getImageDimensions(
        report.signatureDataUrl
      );
      const { width, height } = fitInBox(sigW, sigH, pageWidth - 28, 36);
      if (y + height > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.addImage(
        report.signatureDataUrl,
        pdfImageFormat(report.signatureDataUrl),
        14,
        y,
        width,
        height
      );
      y += height + 6;
    } catch {
      addWrapped("[Signature could not be embedded]");
    }
  }

  section("Photo index");
  ordered.forEach((item, i) => {
    const damage = isPhotoDamageFlagged(item.photo) ? " · DAMAGE" : "";
    addWrapped(
      `${i + 1}. ${item.label}${damage} — ${item.photo?.dataUrl ? "included" : "missing"}`
    );
  });
  y += 4;
  addWrapped("This PDF is a copy. Office /office is the record.");

  let photoNumber = 0;
  for (const item of present) {
    const src = item.photo?.dataUrl;
    if (!src) continue;
    photoNumber += 1;
    doc.addPage();
    y = 16;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${item.label}${isPhotoDamageFlagged(item.photo) ? " · DAMAGE" : ""}`,
      14,
      y
    );
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Photo ${photoNumber} of ${present.length}`, pageWidth - 14, y, {
      align: "right",
    });
    try {
      const dataUrl = await resolvePdfPhoto(
        src,
        checkoutPhotoProxyUrl(report.id, item.angle)
      );
      const { width: imgW, height: imgH } = await getImageDimensions(dataUrl);
      const { width, height } = fitInBox(imgW, imgH, pageWidth - 28, pageHeight - 40);
      const x = 14 + (pageWidth - 28 - width) / 2;
      doc.addImage(dataUrl, pdfImageFormat(dataUrl), x, 22, width, height);
    } catch {
      doc.setFont("helvetica", "normal");
      doc.text("[Photo could not be embedded]", 14, 40);
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${formatUnitLabel(report.unitNumber, plate)} · Page ${i} of ${pages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
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
