import { NextRequest, NextResponse } from "next/server";
import { OFFICE_COOKIE, verifyOfficeToken } from "@/lib/server/office-token";

/** Server-side gate: /admin pages need a valid office session cookie (set by POST /api/office-pin). */
export async function middleware(req: NextRequest) {
  const ok = await verifyOfficeToken(req.cookies.get(OFFICE_COOKIE)?.value);
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/office";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
