import { FIRST_CHOICE_ORG_ID } from "./org-stamp";

/** Thrown when a fleet, row, or file is outside the signed-in company. */
export class OrgAccessError extends Error {
  status = 404;
  constructor() {
    super("Not found");
    this.name = "OrgAccessError";
  }
}

/** Today there is one company. A later sign-in release replaces this. */
export function orgFromSession(): string {
  return FIRST_CHOICE_ORG_ID;
}

export function requireOrgId(orgId: string | undefined | null): string {
  const id = typeof orgId === "string" ? orgId.trim() : "";
  if (!id) throw new OrgAccessError();
  return id;
}

export function checkoutObjectPath(
  orgId: string,
  reportId: string,
  angle: string,
  ext: string
): string {
  return `orgs/${requireOrgId(orgId)}/checkout/${reportId}/${angle}.${ext}`;
}

export function feedbackObjectPath(
  orgId: string,
  feedbackId: string,
  filename: string
): string {
  return `orgs/${requireOrgId(orgId)}/feedback/${feedbackId}/${filename}`;
}

/**
 * Old checkout/ and feedback/ links stay readable.
 * A path under another company's orgs/<id>/ prefix is not.
 */
export function canReadStoredPath(orgId: string, pathname: string): boolean {
  const org = requireOrgId(orgId);
  const clean = pathname.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.split("/").some((part) => part === ".." || part === "")) {
    return false;
  }
  const parts = clean.split("/");
  if (parts[0] !== "orgs") return true;
  return parts[1] === org && parts.length > 2;
}
