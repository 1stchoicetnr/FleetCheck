import { NextResponse } from "next/server";
import { backendStatus } from "@/lib/server/checkout-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(backendStatus());
}
