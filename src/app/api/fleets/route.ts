import { errorResponse } from "@/lib/server/api-error";
import { NextRequest, NextResponse } from "next/server";
import { createFleet, listFleets } from "@/lib/server/checkout-repo";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { assertOwnerAccess, resolveRequestAuth } from "@/lib/server/request-auth";
import { parseFleetName, parseFleetType } from "@/lib/fleet-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    const auth = await resolveRequestAuth(req);
    let fleets = await listFleets(auth.orgId, { includeArchived });
    if (auth.role === "office" || auth.role === "manager") {
      const scope = await fleetScopeFor(auth);
      if (!scope.all) {
        const allowed = new Set(scope.fleetIds);
        fleets = fleets.filter((fleet) => allowed.has(fleet.id));
      }
    }
    return NextResponse.json(
      { fleets },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load fleets");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const body = (await req.json()) as {
      name?: unknown;
      type?: unknown;
      companyId?: unknown;
    };
    const name = parseFleetName(body.name);
    const type = parseFleetType(body.type);
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!name || !type || !companyId) {
      return NextResponse.json(
        { error: "Name, type, and company are required" },
        { status: 400 }
      );
    }
    const fleet = await createFleet(auth.orgId, { name, type, companyId });
    return NextResponse.json({ fleet }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to add fleet");
  }
}
