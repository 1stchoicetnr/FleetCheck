/** True when the server reports a different real build than the one this page was built from. */
export function isStaleBuild(clientBuild: string | undefined, serverBuild: string | undefined): boolean {
  if (!clientBuild || !serverBuild) return false;
  if (clientBuild === "dev" || serverBuild === "dev") return false;
  return clientBuild !== serverBuild;
}

/**
 * Pages where a driver is in the middle of a check (taking photos, signing,
 * sending). An app update must not reload these: a photo just taken, or an
 * upload in progress, would be cut off. The update happens on the next page.
 */
export function isCheckInProgressPath(pathname: string | undefined): boolean {
  return /^\/(checkout|check-in)\/[^/]+\/?$/.test(pathname ?? "");
}
