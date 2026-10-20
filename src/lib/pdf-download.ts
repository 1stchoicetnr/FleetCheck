import type { CheckRecord, CheckoutReport, Fleet, Vehicle } from "./types";
import type { CheckoutPdfOptions } from "./pdf";

/** Load the PDF library only when someone downloads a file. */
export async function downloadCheckoutReportFile(
  report: CheckoutReport,
  options: CheckoutPdfOptions = {}
): Promise<void> {
  const pdf = await import("./pdf");
  const blob = await pdf.generateCheckoutReportPDF(report, options);
  pdf.downloadPDF(
    blob,
    pdf.checkoutReportPdfFilename(report, options.plate ?? report.plate)
  );
}

export async function downloadCheckFile(
  check: CheckRecord,
  vehicle: Vehicle,
  fleet: Fleet,
  filename: string
): Promise<void> {
  const pdf = await import("./pdf");
  const blob = await pdf.generateCheckPDF(check, vehicle, fleet);
  pdf.downloadPDF(blob, filename);
}
