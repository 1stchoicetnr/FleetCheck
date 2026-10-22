import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { acceptLink, openSession, previewLink, publicProfile } from "@/lib/server/auth-accounts";
import { fleetProfileForMember } from "@/lib/server/fleet-scope";
import { applySessionCookie } from "@/lib/server/auth-http";
import { openAuthDb, resolveRequestAuth } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await resolveRequestAuth(req);
    const { token } = await params;
    const db = await openAuthDb();
    const preview = await previewLink(db, token);
    if (!preview) {
      return NextResponse.json(
        { error: "This link has expired or was already used." },
        { status: 404 }
      );
    }
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Could not open this link.");
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await resolveRequestAuth(req);
    const { token } = await params;
    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    const db = await openAuthDb();
    const user = await acceptLink(db, token, password);
    const session = await openSession(db, { id: user.id, orgId: user.orgId, role: user.role });
    return applySessionCookie(
      NextResponse.json(
        {
          user: {
            ...publicProfile(user),
            ...(await fleetProfileForMember(user.orgId, user.id, user.role)),
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      ),
      session
    );
  } catch (err) {
    return errorResponse(err, "Could not save that password.");
  }
}
