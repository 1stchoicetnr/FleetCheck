/** True when the server reports a different real build than the one this page was built from. */
export function isStaleBuild(clientBuild: string | undefined, serverBuild: string | undefined): boolean {
  if (!clientBuild || !serverBuild) return false;
  if (clientBuild === "dev" || serverBuild === "dev") return false;
  return clientBuild !== serverBuild;
}
