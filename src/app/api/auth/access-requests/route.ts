import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { accessRequestLimited, recordAccessRequest } from "@/lib/server/access-limit";
import { pendingAccessRequests, submitAccessRequest } from "@/lib/server/access-requests";
import { postAccessRequestToSlack } from "@/lib/server/access-slack";
import { clientIp } from "@/lib/server/office-pin";
import { assertOfficeAccess, openAuthDb, resolveRequestAuth } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await assertOfficeAccess(req);
    const db = await openAuthDb();
    const requests = await pendingAccessRequests(db, auth.orgId);
    return NextResponse.json(
      { requests, count: requests.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not load access requests.");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    const ip = clientIp(req);
    if (accessRequestLimited(ip)) {
      return NextResponse.json(
        { error: "Too many access requests. Try again in 15 minutes." },
        { status: 429 }
      );
    }
    recordAccessRequest(ip);
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      password?: unknown;
    };
    const db = await openAuthDb();
    const result = await submitAccessRequest(db, auth.orgId, {
      name: typeof body.name === "string" ? body.name : "",
      email: typeof body.email === "string" ? body.email : "",
      phone: typeof body.phone === "string" ? body.phone : "",
      password: typeof body.password === "string" ? body.password : "",
    });
    if (result.created) {
      try {
        await postAccessRequestToSlack({
          name: result.name,
          email: result.email,
          phone: result.phone,
        });
      } catch (err) {
        console.error("[access-request] slack", err);
      }
    }
    return NextResponse.json(
      { status: result.status },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not request access.");
  }
}
