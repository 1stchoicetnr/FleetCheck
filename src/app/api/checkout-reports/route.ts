import { toClientReport } from "@/lib/photo-url";
import { errorResponse } from "@/lib/server/api-error";
import { assertDriverMayCheckVehicle } from "@/lib/server/driver-fleets";
import { vehicleIdsInScope } from "@/lib/server/fleet-scope";
import {
  assertCheckoutSubmitter,
  assertOfficeAccess,
  canViewArchivedRecords,
  resolveRequestAuth,
} from "@/lib/server/request-auth";
import { after, NextRequest, NextResponse } from "next/server";
import { slackLinkOrigin } from "@/lib/server/auth-http";
import { sweepUnsentSoon } from "@/lib/server/unsent-sweep";
import {
  confirmReportSent,
  createReport,
  listReportPage,
} from "@/lib/server/checkout-repo";
import { OfficeListStatus } from "@/lib/office-list";
import type { CheckoutInspectionForm } from "@/lib/inspection-form";
import { CheckoutType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_STATUSES = new Set([
  "all",
  "flagged",
  "pending",
  "pass",
  "conditional",
  "fail",
  "archived",
]);

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOfficeAccess(req);
    const params = req.nextUrl.searchParams;
    const statusParam = params.get("status");
    if (statusParam && !LIST_STATUSES.has(statusParam)) {
      return NextResponse.json({ error: "Unknown status filter" }, { status: 400 });
    }
    const ownerArchive = canViewArchivedRecords(auth);
    if (statusParam === "archived" && !ownerArchive) {
      return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
    }
    const started = performance.now();
    const page = await listReportPage(auth.orgId, {
      includeArchived:
        ownerArchive &&
        (params.get("includeArchived") === "1" || statusParam === "archived"),
      companyId: params.get("companyId") || undefined,
      vehicleId: params.get("vehicleId") || undefined,
      vehicleIds: await vehicleIdsInScope(auth),
      status: (statusParam as OfficeListStatus | null) || undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
      offset: params.has("offset") ? Number(params.get("offset")) : undefined,
    });
    const dur = (performance.now() - started).toFixed(1);
    // Safety net: mark sent any finished check the phone never confirmed.
    const origin = slackLinkOrigin(req);
    after(() => sweepUnsentSoon(auth.orgId, origin) ?? undefined);
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `list;dur=${dur}`,
      },
    });
  } catch (err) {
    return errorResponse(err, "Failed to load reports");
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await assertCheckoutSubmitter(req);
    const orgId = auth.orgId;
    const body = (await req.json()) as {
      companyId?: string;
      vehicleId?: string;
      unitNumber?: string;
      plate?: string;
      year?: number;
      make?: string;
      model?: string;
      odometer?: number;
      driverName?: string;
      dispatcherName?: string;
      type?: CheckoutType;
      inspectionForm?: CheckoutInspectionForm;
      signatureDataUrl?: string;
      signedAt?: string;
      idempotencyKey?: string;
    };
    if (
      !body.companyId ||
      !body.vehicleId ||
      !body.unitNumber ||
      !body.make ||
      !body.model ||
      !body.driverName ||
      !body.dispatcherName ||
      body.year == null ||
      body.odometer == null
    ) {
      return NextResponse.json(
        { error: "Missing required checkout fields" },
        { status: 400 }
      );
    }
    if (
      body.signatureDataUrl &&
      (!/^data:image\/(png|jpeg|webp);base64,/.test(body.signatureDataUrl) ||
        body.signatureDataUrl.length > 700_000)
    ) {
      return NextResponse.json({ error: "Signature image is invalid or too large" }, { status: 400 });
    }
    await assertDriverMayCheckVehicle(auth, body.vehicleId);
    const report = await createReport(orgId, {
      companyId: body.companyId,
      vehicleId: body.vehicleId,
      unitNumber: body.unitNumber,
      plate: body.plate,
      year: Number(body.year),
      make: body.make,
      model: body.model,
      odometer: Number(body.odometer),
      driverName: body.driverName,
      dispatcherName: body.dispatcherName,
      type: body.type === "check_in" ? "check_in" : "check_out",
      inspectionForm: body.inspectionForm,
      signatureDataUrl: body.signatureDataUrl,
      signedAt: body.signedAt,
      driverUserId: auth.userId ?? undefined,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    if (!body.idempotencyKey) {
      // Old cached app (before Oct 20). It never sends the "sent" step, so the
      // server finishes the check itself and tells the phone to reload.
      let finished = report;
      if (report.status === "complete" && !report.sentAt) {
        try {
          finished = await confirmReportSent(orgId, report.id, {
            appOrigin: slackLinkOrigin(req),
            office: false,
          });
        } catch (err) {
          console.log(
            `[checkout-legacy] report=${report.id} result=sent-failed ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      console.log(`[checkout-legacy] report=${report.id} result=created-old-app`);
      return NextResponse.json(
        { report: toClientReport(finished), reload: true },
        { status: 201, headers: { "X-Inspekt-Reload": "1" } }
      );
    }
    return NextResponse.json({ report: toClientReport(report) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to create report");
  }
}
