import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { assertCanRemoveUser, removeThrowawayUser } from "@/lib/server/auth-accounts";
import { assertOwnerAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOwnerAccess(req);
    const { id } = await params;
    assertCanRemoveUser(id);
    const db = await openAuthDb();
    const removed = await removeThrowawayUser(db, auth.orgId, id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not remove that person.");
  }
}
