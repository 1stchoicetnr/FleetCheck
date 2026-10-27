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
  walkaroundPhotoSteps,
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
  damageFlagText,
  isPhotoDamageFlagged,
} from "./photo-flags";
import { checkoutDamageLines, formatCheckoutTime, fuelGaugeLabel } from "./checkout-slack";
import { companyUsesClover } from "./companies";
import { INSPEKT_ICON, INSPEKT_NAVY_RGB } from "./brand-mark";
import {
  formatCloverSerial,
  inspectionFormSummaryLines,
} from "./inspection-form";

export type CheckoutPdfOptions = {
  companyName?: string;
  plate?: string;
  steps?: PhotoStep[];
  logoDataUrl?: string;
  usesClover?: boolean;
};

async function inspektLogoDataUrl(): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  try {
    const res = await fetch(INSPEKT_ICON);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Navy band with the Inspekt mark. Returns the y where body copy starts. */
function paintInspektHeader(
  doc: jsPDF,
  logo: string | null,
  subtitle: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(INSPEKT_NAVY_RGB[0], INSPEKT_NAVY_RGB[1], INSPEKT_NAVY_RGB[2]);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFillColor(34, 197, 94);
  doc.rect(0, 32, pageWidth, 1.4, "F");
  if (logo) {
    try {
      const format = logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(logo, format, 10, 6, 20, 20);
    } catch {
      // Wordmark still prints if the icon cannot be embedded.
    }
  }
  const textX = logo ? 34 : 14;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Inspekt", textX, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(212, 212, 216);
  doc.text(subtitle, textX, 22);
  doc.setTextColor(26, 26, 26);
  return 42;
}

function paintSectionRule(doc: jsPDF, title: string, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(26, 26, 26);
  doc.text(title, 14, y);
  const width = Math.min(doc.getTextWidth(title), 72);
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.7);
  doc.line(14, y + 1.5, 14 + width, y + 1.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(38, 38, 38);
}

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
  return `inspekt-${slug}-${stamp}.pdf`;
}

function checkoutPhotoProxyUrl(reportId: string, angle: PhotoAngle): string {
  return `/api/checkout-reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(angle)}`;
}

export async function generateCheckPDF(
  check: CheckRecord,
  vehicle: Vehicle,
  fleet: Fleet,
  logoDataUrl?: string
): Promise<Blob> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = logoDataUrl || (await inspektLogoDataUrl());
  let y = paintInspektHeader(
    doc,
    logo,
    `Report · ${formatDate(new Date().toISOString())}`
  );

  paintSectionRule(doc, "Vehicle Information", y);
  y += 8;
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

  paintSectionRule(doc, "Mileage", y);
  y += 8;
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
    paintSectionRule(doc, "Fuel Level", y);
    y += 8;
    doc.text(FUEL_LEVEL_LABELS[check.fuelLevel], 14, y);
    y += 10;
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Condition: ${check.conditionRating.toUpperCase()}`, 14, y);
  y += 10;

  if (check.maintenanceIssues.length > 0) {
    paintSectionRule(doc, "Reported Issues", y);
    y += 8;
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
    paintSectionRule(doc, "Tow Equipment Check", y);
    y += 8;
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
    paintSectionRule(doc, "Additional Notes", y);
    y += 8;
    const splitNotes = doc.splitTextToSize(check.notes, pageWidth - 28);
    doc.text(splitNotes, 14, y);
    y += splitNotes.length * 6 + 5;
  }

  if (check.knownIssueConsent) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    paintSectionRule(doc, "Known Issue Consent", y);
    y += 8;
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
    paintSectionRule(doc, "Driver Signature", y);
    y += 6;
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
    paintSectionRule(doc, "Vehicle Photos", y);
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
  const logo = options.logoDataUrl || (await inspektLogoDataUrl());
  const plate = options.plate ?? report.plate;
  const steps = walkaroundPhotoSteps(
    options.steps?.length ? options.steps : PHOTO_ANGLES
  );
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
  const present = listed.filter((item) => item.photo?.dataUrl);

  let y = paintInspektHeader(
    doc,
    logo,
    `Checkout Report · ${formatCheckoutTime(report.completedAt)}`
  );
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(55, 55, 55);
  doc.text("Inspection form + picture report", pageWidth / 2, y, {
    align: "center",
  });
  y += 8;
  doc.setTextColor(26, 26, 26);

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
    paintSectionRule(doc, title, y);
    y += 8;
  };

  section("Checkout");
  addWrapped(`Date and time: ${formatCheckoutTime(report.completedAt)}`);
  addWrapped(`Driver: ${report.driverName.trim() || "—"}`);
  addWrapped(`Dispatcher: ${report.dispatcherName.trim() || "—"}`);
  addWrapped(`Unit: ${formatUnitLabel(report.unitNumber, plate)}`);
  addWrapped(`Odometer: ${formatMileage(report.odometer)}`);
  addWrapped(`Fuel: ${fuelGaugeLabel(report.inspectionForm)}`);
  const damage = checkoutDamageLines(report);
  addWrapped(damage.length ? `Damage: ${damage.join("; ")}` : "Damage: none");

  section("Driver signature");
  if (report.signedAt) {
    addWrapped(`Signed: ${formatCheckoutTime(report.signedAt)}`);
  }
  if (report.signatureDataUrl?.trim()) {
    try {
      const dataUrl = report.signatureDataUrl.startsWith("data:")
        ? report.signatureDataUrl
        : await resolvePdfPhoto(report.signatureDataUrl);
      let width = 90;
      let height = 36;
      try {
        const size = await getImageDimensions(dataUrl);
        const fitted = fitInBox(size.width, size.height, pageWidth - 28, 36);
        width = fitted.width;
        height = fitted.height;
      } catch {
        // The signature pad is 600×240. Keep that shape when the size cannot be read.
      }
      if (y + height > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(180, 180, 180);
      doc.rect(14, y, Math.max(width, 40), height);
      doc.addImage(dataUrl, pdfImageFormat(dataUrl), 14, y, width, height);
      y += height + 8;
    } catch {
      addWrapped("[Signature could not be embedded]");
    }
  } else {
    addWrapped("Signature: missing");
  }

  section("Precheck");
  const usesClover = options.usesClover ?? companyUsesClover(report.companyId);
  const formLines = [
    `Date: ${formatDateOnly(report.inspectionForm?.inspectedAt || report.completedAt)}`,
    `Name: ${report.driverName}`,
    `Vehicle: ${report.year} ${report.make} ${report.model}`,
    `Unit #: ${report.unitNumber}`,
    ...(usesClover
      ? [`Clover serial (last digits): ${formatCloverSerial(report.inspectionForm)}`]
      : []),
    `Company: ${options.companyName || "—"}`,
    `Plate: ${plate || "—"}`,
    `Type: ${report.type === "check_in" ? "Check In" : "Check Out"}`,
    `Odometer start: ${formatMileage(report.odometer)}`,
    `Dispatcher: ${report.dispatcherName}`,
    `Completed: ${formatCheckoutTime(report.completedAt)}`,
    `Photos: ${present.length} of ${listed.length}`,
    `Office id: ${report.id}`,
  ];
  for (const line of formLines) addWrapped(line);

  section("Precheck answers");
  if (report.inspectionForm) {
    for (const line of inspectionFormSummaryLines(report.inspectionForm, {
      includeClover: usesClover,
      driverName: report.driverName,
    })) {
      addWrapped(line);
    }
  } else {
    addWrapped("No Precheck on this report (submitted before Precheck was added).");
  }

  section("Office review");
  addWrapped(`Status: ${CHECKOUT_REVIEW_LABELS[report.reviewStatus]}`);
  if (report.reviewedAt) {
    addWrapped(
      `Reviewed: ${formatCheckoutTime(report.reviewedAt)}${
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
  const damagedPhotos = report.photos.filter((photo) => isPhotoDamageFlagged(photo));
  if (damagedPhotos.length) {
    addWrapped(
      `DAMAGE flagged: ${damagedPhotos.map((photo) => damageFlagText(photo, report.driverName)).join("; ")}`
    );
  }

  section("Photo index");
  listed.forEach((item, i) => {
    const flagged = item.photo && isPhotoDamageFlagged(item.photo);
    const title = flagged && item.photo ? damageFlagText(item.photo, report.driverName) : item.label;
    addWrapped(
      `${i + 1}. ${title}${flagged ? " · DAMAGE" : ""} — ${item.photo?.dataUrl ? "included" : "missing"}`
    );
  });
  y += 4;
  addWrapped("This PDF is a copy. Office /office is the record.");

  const perPage = present.length > 4 ? 3 : 2;
  for (let start = 0; start < present.length; start += perPage) {
    const slice = present.slice(start, start + perPage);
    doc.addPage();
    const slotHeight = (pageHeight - 28) / perPage;
    for (let index = 0; index < slice.length; index += 1) {
      const item = slice[index];
      const photoNumber = start + index + 1;
      const top = 14 + index * slotHeight;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const flagged = item.photo && isPhotoDamageFlagged(item.photo);
      const caption = `${photoNumber}. ${
        flagged && item.photo ? damageFlagText(item.photo, report.driverName) : item.label
      }${flagged ? " · DAMAGE" : ""}${
        item.photo?.qualityNote ? ` · ${item.photo.qualityNote}` : ""
      }`;
      const captionLine = String(doc.splitTextToSize(caption, pageWidth - 28)[0] ?? caption);
      doc.text(captionLine, 14, top);
      const src = item.photo?.dataUrl;
      if (!src) continue;
      try {
        const dataUrl = await resolvePdfPhoto(
          src,
          checkoutPhotoProxyUrl(report.id, item.angle)
        );
        const { width: imgW, height: imgH } = await getImageDimensions(dataUrl);
        const { width, height } = fitInBox(imgW, imgH, pageWidth - 28, slotHeight - 16);
        const x = 14 + (pageWidth - 28 - width) / 2;
        doc.addImage(dataUrl, pdfImageFormat(dataUrl), x, top + 4, width, height);
      } catch {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("[Photo could not be embedded]", 14, top + 12);
      }
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Inspekt · ${formatUnitLabel(report.unitNumber, plate)} · Page ${i} of ${pages}`,
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
