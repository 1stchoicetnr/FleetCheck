import { errorResponse } from "@/lib/server/api-error";
import { createAppUser, listAppUsers } from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import { orgFromSession } from "@/lib/server/org-scope";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await assertOfficePin(req);
    const users = await listAppUsers(orgFromSession());
    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to load users");
  }
}

export async function POST(req: Request) {
  try {
    await assertOfficePin(req);
    const body = (await req.json()) as { name?: string; email?: string; role?: UserRole };
    if (!body.name || !body.email || !body.role) {
      return NextResponse.json({ error: "Name, email, and role are required" }, { status: 400 });
    }
    const user = await createAppUser(orgFromSession(), {
      name: body.name,
      email: body.email,
      role: body.role,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to add user");
  }
}
