import { NextResponse } from "next/server";
import { checkOfficePinGuarded, officePinEnabled, OfficeAuthError } from "@/lib/server/office-pin";
import { resolveRequestAuth } from "@/lib/server/request-auth";
import {
  createOfficeToken,
  OFFICE_COOKIE,
  OFFICE_COOKIE_MAX_AGE,
} from "@/lib/server/office-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await resolveRequestAuth(req);
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  try {
    if (!(await officePinEnabled())) {
      throw new OfficeAuthError("Sign in with your email. The office PIN is off.", 403);
    }
    checkOfficePinGuarded(req, body.pin || "");
  } catch (err) {
    const e = err instanceof OfficeAuthError ? err : new OfficeAuthError("Invalid office PIN", 401);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  const token = await createOfficeToken();
  const res = NextResponse.json({ ok: true });
  if (token) {
    res.cookies.set(OFFICE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OFFICE_COOKIE_MAX_AGE,
    });
  }
  return res;
}

/** Lock office: clear the session cookie. */
export async function DELETE(req: Request) {
  await resolveRequestAuth(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OFFICE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
