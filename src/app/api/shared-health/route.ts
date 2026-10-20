import { NextResponse } from "next/server";
import { backendStatus } from "@/lib/server/checkout-repo";
import { resolveRequestAuth } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await resolveRequestAuth(req);
  return NextResponse.json(backendStatus());
}
