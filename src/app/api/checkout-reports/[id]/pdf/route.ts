import { errorResponse } from "@/lib/server/api-error";
import { getPublicCompanySettings, getReport, listVehicleReports } from "@/lib/server/checkout-repo";
import { beforeAfterPairs, beforeCaption } from "@/lib/damage-before-after";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { checkoutReportPdfBytes } from "@/lib/server/pdf-runtime";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { photoStepsForCompany, usesClover } from "@/lib/company-settings";
import { checkoutReportPdfFilename } from "@/lib/pdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const report = await getReport(auth.orgId, id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertVehicleInScope(auth, report.vehicleId);
    const settings = await getPublicCompanySettings(auth.orgId);
    const pairs = beforeAfterPairs(
      report,
      await listVehicleReports(auth.orgId, report.vehicleId).catch(() => []),
      { keepStored: true }
    );
    const bytes = await checkoutReportPdfBytes(report, {
      logoDataUrl: settings.pdfLogoDataUrl || undefined,
      usesClover: usesClover(settings, report.companyId),
      steps: photoStepsForCompany(settings, report.companyId),
      plate: report.plate,
      damageCompare: pairs.map((pair) => ({
        label: pair.label,
        beforeSrc: pair.before?.stored,
        afterSrc: pair.after?.stored,
        beforeCaption: beforeCaption(pair, formatCheckoutTime),
      })),
    });
    const filename = checkoutReportPdfFilename(report, report.plate).replace(/[^\w.-]+/g, "");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename || "checkout.pdf"}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "Failed to build the PDF");
  }
}
