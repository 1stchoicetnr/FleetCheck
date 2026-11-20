import { errorResponse } from "@/lib/server/api-error";
import { getPublicCompanySettings, getReport, listVehicleReports } from "@/lib/server/checkout-repo";
import { beforeAfterPairs, beforeCaption } from "@/lib/damage-before-after";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { answerLabel } from "@/lib/known-damage";
import { listKnownDamage } from "@/lib/server/known-damage-repo";
import { photoAngleLabel } from "@/lib/photo-flags";
import type { PdfDamageCompare } from "@/lib/pdf";
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
    // Known damage check: the known photo next to this check's photo, even when the driver said "Same".
    const answered = report.photos.filter((p) => p.knownDamageId && p.knownDamageAnswer);
    const knownCompare: PdfDamageCompare[] = [];
    if (answered.length) {
      const known = await listKnownDamage(auth.orgId, report.vehicleId).catch(() => []);
      for (const photo of answered) {
        const item = known.find((k) => k.id === photo.knownDamageId);
        const source = item?.sourceReportId
          ? await getReport(auth.orgId, item.sourceReportId).catch(() => undefined)
          : undefined;
        const review = photo.damageReview
          ? ` · Office: ${photo.damageReview.kind === "false_report" ? "Not new" : "Actually new"}`
          : "";
        knownCompare.push({
          label: `${photoAngleLabel(photo.angle)} · known damage: ${item?.description ?? "removed"} · driver said ${answerLabel(photo.knownDamageAnswer)}${review}`,
          beforeSrc: source?.photos.find((p) => p.angle === item?.angle)?.dataUrl,
          afterSrc: photo.dataUrl,
          beforeCaption: item ? `Known · ${formatCheckoutTime(item.createdAt)}` : "No known-damage photo",
        });
      }
    }
    const bytes = await checkoutReportPdfBytes(report, {
      logoDataUrl: settings.pdfLogoDataUrl || undefined,
      usesClover: usesClover(settings, report.companyId),
      steps: photoStepsForCompany(settings, report.companyId),
      plate: report.plate,
      damageCompare: [
        ...pairs.map((pair) => ({
          label: pair.label,
          beforeSrc: pair.before?.stored,
          afterSrc: pair.after?.stored,
          beforeCaption: beforeCaption(pair, formatCheckoutTime),
        })),
        ...knownCompare,
      ],
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
