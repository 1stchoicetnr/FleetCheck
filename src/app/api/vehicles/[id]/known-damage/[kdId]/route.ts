import { errorResponse } from "@/lib/server/api-error";
import { cleanKnownDamagePatch } from "@/lib/known-damage";
import { updateKnownDamage } from "@/lib/server/known-damage-repo";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Change status/note/target date, or mark Repaired (who/when). Office only. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; kdId: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id, kdId } = await params;
    await assertVehicleInScope(auth, id);
    const patch = cleanKnownDamagePatch(await req.json().catch(() => ({})));
    if ("error" in patch) return NextResponse.json({ error: patch.error }, { status: 400 });
    const item = await updateKnownDamage(auth.orgId, id, kdId, patch, auth.name || auth.email || "Office");
    return NextResponse.json({ item });
  } catch (err) {
    return errorResponse(err, "Failed to update known damage");
  }
}
