import { errorResponse } from "@/lib/server/api-error";
import { updateAppUser } from "@/lib/server/checkout-repo";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      role?: UserRole;
      active?: boolean;
    };
    const user = await updateAppUser(auth.orgId, id, body);
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err, "Failed to update user");
  }
}
