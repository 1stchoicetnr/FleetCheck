import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { checkPassword, openSession, publicProfile } from "@/lib/server/auth-accounts";
import { applySessionCookie } from "@/lib/server/auth-http";
import {
  clearLoginFails,
  loginLocked,
  recordLoginFail,
} from "@/lib/server/login-limit";
import { clientIp } from "@/lib/server/office-pin";
import { openAuthDb, resolveRequestAuth } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    const ip = clientIp(req);
    if (loginLocked(ip)) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      password?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const db = await openAuthDb();
    const user =
      email && password ? await checkPassword(db, auth.orgId, email, password) : null;
    if (!user) {
      recordLoginFail(ip);
      return NextResponse.json({ error: "Email or password is wrong." }, { status: 401 });
    }
    clearLoginFails(ip);
    const token = await openSession(db, { id: user.id, orgId: auth.orgId, role: user.role });
    return applySessionCookie(
      NextResponse.json(
        { user: publicProfile(user) },
        { headers: { "Cache-Control": "no-store" } }
      ),
      token
    );
  } catch (err) {
    return errorResponse(err, "Could not sign in.");
  }
}
