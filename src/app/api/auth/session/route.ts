import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { publicProfile } from "@/lib/server/auth-accounts";
import { fleetProfileForMember } from "@/lib/server/fleet-scope";
import { resolveRequestAuth } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    if (!auth.userId || !auth.role || !auth.name || !auth.email) {
      return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
    }
    const profile = publicProfile({
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      role: auth.role,
    });
    const fleets = await fleetProfileForMember(auth.orgId, auth.userId, auth.role);
    return NextResponse.json(
      { user: { ...profile, ...fleets } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not read the session.");
  }
}
