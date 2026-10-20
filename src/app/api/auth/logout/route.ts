import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/server/auth-store";
import { hashSecret, SESSION_COOKIE } from "@/lib/server/auth-tokens";
import { applySessionCookie } from "@/lib/server/auth-http";
import { openAuthDb, resolveRequestAuth } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function POST(req: Request) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token) {
    try {
      const db = await openAuthDb();
      await deleteSession(db, hashSecret(token));
    } catch (err) {
      console.error("[api] logout session delete failed:", err);
    }
  } else {
    await resolveRequestAuth(req);
  }
  return applySessionCookie(NextResponse.json({ ok: true }), null);
}
