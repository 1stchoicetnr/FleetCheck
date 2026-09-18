import { getOfficePin } from "./shared-config";

export function pinFromRequest(req: Request): string {
  return (
    req.headers.get("x-office-pin") ||
    req.headers.get("X-Office-Pin") ||
    ""
  ).trim();
}

export function assertOfficePin(req: Request): void {
  const expected = getOfficePin();
  const got = pinFromRequest(req);
  if (!got || got !== expected) {
    const err = new Error("Invalid office PIN") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
}

export function checkOfficePin(pin: string): boolean {
  return pin.trim() === getOfficePin();
}
