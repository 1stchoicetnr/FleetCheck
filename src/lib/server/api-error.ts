import { NextResponse } from "next/server";
import { OfficeAuthError } from "./office-pin";
import { SharedBackendError } from "./checkout-repo";
import { PhotoValidationError } from "./photo-store";

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Log the real error server-side; send clients only safe, generic text. */
export function errorResponse(err: unknown, fallback: string): NextResponse {
  if (
    err instanceof OfficeAuthError ||
    err instanceof RequestError ||
    err instanceof PhotoValidationError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof SharedBackendError && err.status < 500) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`[api] ${fallback}:`, err);
  const status = err instanceof SharedBackendError ? err.status : 500;
  return NextResponse.json({ error: fallback }, { status });
}
