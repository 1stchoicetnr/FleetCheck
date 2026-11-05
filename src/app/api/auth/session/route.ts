import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { publicProfile } from "@/lib/server/auth-accounts";
import { fleetProfileForMember } from "@/lib/server/fleet-scope";
import { resolveRequestAuth } from "@/lib/server/request-auth";
import { cleanOwnName } from "@/lib/driver-name";
import { pgDb } from "@/lib/server/postgres-store";
import { updateOwnName } from "@/lib/server/org-data";

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

/** Signed-in person sets their own display name (used as the driver on checks). */
export async function PATCH(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    if (!auth.userId || !auth.role || !auth.email) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanOwnName(body.name);
    if (!name) {
      return NextResponse.json(
        { error: "Enter your real first and last name, not Driver." },
        { status: 400 }
      );
    }
    await updateOwnName(pgDb(), auth.orgId, auth.userId, name);
    const profile = publicProfile({ id: auth.userId, name, email: auth.email, role: auth.role });
    const fleets = await fleetProfileForMember(auth.orgId, auth.userId, auth.role);
    return NextResponse.json({ user: { ...profile, ...fleets } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Could not save your name.");
  }
}
