/** One production checkout Ashley approved. Removed after that send. */
export const CHECKOUT_PROBE_DRIVER = "TEST Checkout";
export const CHECKOUT_PROBE_DISPATCHER = "TEST probe";

export function isCheckoutProbe(report: {
  driverName?: string | null;
  dispatcherName?: string | null;
}): boolean {
  return (
    (report.driverName ?? "").trim() === CHECKOUT_PROBE_DRIVER &&
    (report.dispatcherName ?? "").trim() === CHECKOUT_PROBE_DISPATCHER
  );
}

/**
 * Ashley's DM webhook for the probe. A missing hook, or one that is actually
 * a Rad Cab channel hook, refuses the send instead of falling back.
 */
export function probeSlackWebhook(env: {
  feedback?: string | null;
  radcabcr?: string | null;
  repairs?: string | null;
}): string {
  const feedback = env.feedback?.trim() || "";
  if (!feedback) {
    throw new Error("Ashley DM webhook is not configured");
  }
  const blocked = [env.radcabcr, env.repairs]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (blocked.includes(feedback)) {
    throw new Error("Ashley DM webhook matches a Rad Cab channel webhook");
  }
  return feedback;
}
