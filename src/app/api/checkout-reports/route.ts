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
  createReport,
  finishReportIfComplete,
  listReportPage,
} from "@/lib/server/checkout-repo";
import { OfficeListStatus } from "@/lib/office-list";
import { pollFinish } from "@/lib/checkout-finish";
import type { CheckoutInspectionForm } from "@/lib/inspection-form";
import { CheckoutType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Old-app creates keep watching for their photos after answering (see POST).
export const maxDuration = 60;

/** About 50 seconds: an old-app phone uploads 26 photos in 7 batches. */
const OLD_APP_WATCH_TRIES = 10;
const OLD_APP_WATCH_DELAY_MS = 5_000;

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
    const origin = slackLinkOrigin(req);
    if (!body.idempotencyKey) {
      // Old cached app (before Oct 20). It creates the check with no photos,
      // uploads them in later requests, and never sends the "sent" step. Each
      // upload finishes the check when the last photo lands; as a backstop this
      // request keeps checking for a short while after it answers the phone.
      let finished = report;
      try {
        const now = await finishReportIfComplete(orgId, report.id, {
          appOrigin: origin,
          source: "create-old-app",
        });
        if (now.report) finished = now.report;
        if (now.action === "wait") {
          after(async () => {
            const result = await pollFinish(
              async () =>
                (await finishReportIfComplete(orgId, report.id, {
                  appOrigin: origin,
                  source: "create-old-app-watch",
                })).action,
              { tries: OLD_APP_WATCH_TRIES, delayMs: OLD_APP_WATCH_DELAY_MS }
            ).catch((err) => {
              console.log(
                `[checkout-legacy] report=${report.id} result=watch-failed ${err instanceof Error ? err.message : String(err)}`
              );
              return null;
            });
            if (result) {
              console.log(
                `[checkout-legacy] report=${report.id} result=watch-${result.action} tries=${result.tries}`
              );
            }
          });
        }
      } catch (err) {
        console.log(
          `[checkout-legacy] report=${report.id} result=sent-failed ${err instanceof Error ? err.message : String(err)}`
        );
      }
      console.log(`[checkout-legacy] report=${report.id} result=created-old-app`);
      return NextResponse.json(
        { report: toClientReport(finished), reload: true },
        { status: 201, headers: { "X-Inspekt-Reload": "1" } }
      );
    }
    if (report.status === "complete" && !report.sentAt) {
      // A red precheck needs no photos. Finish it now in case the phone drops off.
      after(() =>
        finishReportIfComplete(orgId, report.id, { appOrigin: origin, source: "create" })
          .then(() => undefined)
          .catch(() => undefined)
      );
    }
    return NextResponse.json({ report: toClientReport(report) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to create report");
  }
}
