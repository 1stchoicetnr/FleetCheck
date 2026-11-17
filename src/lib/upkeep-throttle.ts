/** App traffic runs the unsent sweep and Slack retries at most this often per server instance. */
export const UPKEEP_EVERY_MS = 3 * 60 * 1000;

/**
 * Production only (or local dev with no VERCEL_ENV). Previews share the live
 * database, so they must not finish checks or post to Slack.
 */
export function shouldRunUpkeep(input: {
  env: string | undefined;
  now: number;
  lastRun: number;
  running: boolean;
}): boolean {
  if (input.env && input.env !== "production") return false;
  if (input.running) return false;
  return input.now - input.lastRun >= UPKEEP_EVERY_MS;
}
