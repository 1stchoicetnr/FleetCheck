import { errorResponse } from "@/lib/server/api-error";
import { cleanKnownDamageInput } from "@/lib/known-damage";
import { addKnownDamage, listKnownDamage } from "@/lib/server/known-damage-repo";
import { assertDriverMayCheckVehicle } from "@/lib/server/driver-fleets";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertApprovedUser, assertOfficeAccess, sessionGrantsOffice } from "@/lib/server/request-auth";
import { isOfficeRequest } from "@/lib/server/office-pin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function actor(auth: { name?: string; email?: string; source: string }): string {
  return auth.name || auth.email || (auth.source === "pin" ? "Office" : "Office");
}

/**
 * Office: every known-damage record on the unit (repaired included).
 * Driver allowed to check the unit: the photo-step question needs active items,
 * and repaired ones (slot + time only) so damage reported before a repair is
 * not asked about again.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let office = false;
    let orgId: string;
    try {
      const auth = await assertApprovedUser(req);
      orgId = auth.orgId;
      if (sessionGrantsOffice(auth)) {
        await assertVehicleInScope(auth, id);
        office = true;
      } else {
        await assertDriverMayCheckVehicle(auth, id);
      }
    } catch (err) {
      if (!(await isOfficeRequest(req))) throw err;
      const auth = await assertOfficeAccess(req);
      orgId = auth.orgId;
      office = true;
    }
    const all = await listKnownDamage(orgId, id);
    const items = office
      ? all
      : all.map((item) => ({
          id: item.id,
          vehicleId: item.vehicleId,
          angle: item.angle,
          description: item.description,
          note: item.note,
          status: item.status,
          sourceReportId: item.sourceReportId,
          createdAt: item.createdAt,
          ...(item.repairedAt ? { repairedAt: item.repairedAt } : {}),
        }));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to load known damage");
  }
}

/** Office marks damage "Known – not fixing" or "Fix later". */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    await assertVehicleInScope(auth, id);
    const input = cleanKnownDamageInput(await req.json().catch(() => ({})));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const item = await addKnownDamage(auth.orgId, id, input, actor(auth));
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err, "Failed to save known damage");
  }
}
