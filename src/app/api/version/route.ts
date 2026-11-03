import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const build = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 12);
  return NextResponse.json({ build }, { headers: { "Cache-Control": "no-store" } });
}
