import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError, openSession, publicProfile } from "@/lib/server/auth-accounts";
import { applySessionCookie } from "@/lib/server/auth-http";
import { findOwnerWithoutPassword } from "@/lib/server/org-data";
import { orgFromSession } from "@/lib/server/org-scope";
import {
  checkOfficePinGuarded,
  officePinEnabled,
  OfficeAuthError,
} from "@/lib/server/office-pin";
import { pinFallbackOpen } from "@/lib/server/pin-fallback";
import { openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pinFallback = await pinFallbackOpen();
    return NextResponse.json(
      { pinFallback },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[owner-setup]", err);
    return NextResponse.json(
      { pinFallback: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!(await officePinEnabled())) {
      throw new OfficeAuthError("Sign in with your email. The office PIN is off.", 403);
    }
    checkOfficePinGuarded(req, pin);
    const db = await openAuthDb();
    const orgId = orgFromSession();
    const owner = await findOwnerWithoutPassword(db, orgId);
    if (!owner) {
      throw new AuthError("Sign in with your email. The office PIN is off.", 403);
    }
    const token = await openSession(db, {
      id: String(owner.id),
      orgId,
      role: "owner",
    });
    return applySessionCookie(
      NextResponse.json(
        {
          user: publicProfile({
            id: String(owner.id),
            name: String(owner.name),
            email: String(owner.email),
            role: "owner",
          }),
        },
        { headers: { "Cache-Control": "no-store" } }
      ),
      token
    );
  } catch (err) {
    return errorResponse(err, "Could not open owner setup.");
  }
}
