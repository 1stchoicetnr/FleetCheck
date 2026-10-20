import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, sessionCookieOptions } from "./auth-tokens";

export function publicOrigin(req: Request): string {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim();
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export function applySessionCookie(res: NextResponse, token: string | null): NextResponse {
  res.cookies.set(
    SESSION_COOKIE,
    token ?? "",
    sessionCookieOptions(token ? SESSION_MAX_AGE_SEC : 0)
  );
  return res;
}

export async function inviteQr(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 280,
    errorCorrectionLevel: "M",
    color: { dark: "#0F1521", light: "#FFFFFF" },
  });
}
