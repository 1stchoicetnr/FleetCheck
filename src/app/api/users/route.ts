import { errorResponse } from "@/lib/server/api-error";
import { createAppUser, listAppUsers } from "@/lib/server/checkout-repo";
import { assertOwnerAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const users = await listAppUsers(auth.orgId);
    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to load users");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const body = (await req.json()) as { name?: string; email?: string; role?: UserRole };
    if (!body.name || !body.email || !body.role) {
      return NextResponse.json({ error: "Name, email, and role are required" }, { status: 400 });
    }
    const user = await createAppUser(auth.orgId, {
      name: body.name,
      email: body.email,
      role: body.role,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to add user");
  }
}
