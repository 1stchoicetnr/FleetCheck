import { sweepUnsentReports } from "./checkout-repo";

const SWEEP_EVERY_MS = 2 * 60 * 1000;
let lastSweep = 0;
let running: Promise<unknown> | null = null;

/**
 * Run the unsent-check sweep at most once every 2 minutes per server instance.
 * Office list loads call this after the response is sent, so Office never waits.
 */
export function sweepUnsentSoon(orgId: string, appOrigin?: string): Promise<unknown> | null {
  const now = Date.now();
  if (running || now - lastSweep < SWEEP_EVERY_MS) return null;
  lastSweep = now;
  running = sweepUnsentReports(orgId, { appOrigin })
    .catch((err) => {
      console.log(`[checkout-sweep] result=error ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      running = null;
    });
  return running;
}
