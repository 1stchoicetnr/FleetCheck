/** Who and what a failed API call was about, for the server log. */
export interface ApiErrorContext {
  route?: string;
  reportId?: string;
  userId?: string | null;
  userName?: string | null;
}

function clean(value: string, max = 160): string {
  return value.replace(/\s+/g, " ").replace(/"/g, "'").trim().slice(0, max);
}

/**
 * One line per refused request (401, 403, 404, 409 ...). These were not logged
 * before, so a phone stuck on "Sign in first" or "closed for new photos" left no trace.
 */
export function formatClientErrorLog(
  status: number,
  message: string,
  ctx?: ApiErrorContext
): string {
  const parts = [`[api-4xx] status=${status}`];
  if (ctx?.route) parts.push(`route=${clean(ctx.route, 60)}`);
  if (ctx?.reportId) parts.push(`report=${clean(ctx.reportId, 80)}`);
  parts.push(`user=${ctx?.userId ? clean(ctx.userId, 60) : "signed-out"}`);
  if (ctx?.userName) parts.push(`name="${clean(ctx.userName, 60)}"`);
  parts.push(`error="${clean(message)}"`);
  return parts.join(" ");
}
