import { fetchCompanySettings } from "./checkout-api";
import { photoStepsForCompany, usesClover } from "./company-settings";
import type { CheckRecord, CheckoutReport, Fleet, Vehicle } from "./types";
import type { CheckoutPdfOptions } from "./pdf";

async function companyPdfOptions(companyId?: string): Promise<CheckoutPdfOptions> {
  try {
    const settings = await fetchCompanySettings();
    return {
      logoDataUrl: settings.pdfLogoDataUrl || undefined,
      usesClover: usesClover(settings, companyId),
      steps: photoStepsForCompany(settings, companyId),
    };
  } catch {
    return {};
  }
}

/** Load the PDF library only when someone downloads a file. */
export async function downloadCheckoutReportFile(
  report: CheckoutReport,
  options: CheckoutPdfOptions = {}
): Promise<void> {
  const pdf = await import("./pdf");
  const fromSettings = await companyPdfOptions(report.companyId);
  const blob = await pdf.generateCheckoutReportPDF(report, {
    ...fromSettings,
    ...options,
    steps: options.steps ?? fromSettings.steps,
    logoDataUrl: options.logoDataUrl ?? fromSettings.logoDataUrl,
  });
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
  const fromSettings = await companyPdfOptions(fleet.companyId);
  const blob = await pdf.generateCheckPDF(check, vehicle, fleet, fromSettings.logoDataUrl);
  pdf.downloadPDF(blob, filename);
}
