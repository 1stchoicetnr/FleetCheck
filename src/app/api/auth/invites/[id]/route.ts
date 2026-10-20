import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { revokeInvite } from "@/lib/server/auth-store";
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
    const db = await openAuthDb();
    const revoked = await revokeInvite(db, auth.orgId, id);
    if (!revoked) {
      return NextResponse.json({ error: "That invite is already closed." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not revoke that invite.");
  }
}
