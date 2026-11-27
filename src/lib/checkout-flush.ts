/** How often an open app retries checks that are still on the phone. */
export const OUTBOX_FLUSH_INTERVAL_MS = 15_000;

/** Background Sync tag. Chrome retries this when the phone has a signal. */
export const CHECKOUT_BACKGROUND_SYNC_TAG = "inspekt-checkout-outbox";

/** Service worker → page: send the waiting checks now. */
export const FLUSH_OUTBOX_MESSAGE = "flush-checkout-outbox";

/** Page → service worker: the flush attempt finished. */
export const FLUSH_OUTBOX_DONE_MESSAGE = "flush-checkout-done";

export type FlushTrigger = "mount" | "interval" | "visible" | "online" | "background-sync";

/**
 * Whether this trigger should send waiting checks. Offline never flushes.
 * A visibility event only flushes when the app is actually on screen.
 */
export function flushTriggerFires(input: {
  trigger: FlushTrigger;
  online: boolean;
  visible: boolean;
}): boolean {
  if (!input.online) return false;
  switch (input.trigger) {
    case "mount":
    case "interval":
    case "online":
    case "background-sync":
      return true;
    case "visible":
      return input.visible;
    default: {
      const never: never = input.trigger;
      return never;
    }
  }
}

export function isFlushOutboxMessage(data: unknown): boolean {
  return Boolean(
    data && typeof data === "object" && (data as { type?: unknown }).type === FLUSH_OUTBOX_MESSAGE
  );
}

export function isFlushOutboxDoneMessage(
  data: unknown
): data is { type: typeof FLUSH_OUTBOX_DONE_MESSAGE; pending: number } {
  if (!data || typeof data !== "object") return false;
  const message = data as { type?: unknown; pending?: unknown };
  return message.type === FLUSH_OUTBOX_DONE_MESSAGE && typeof message.pending === "number";
}

/** Register Background Sync only while at least one check is still on the phone. */
export function shouldRegisterBackgroundSync(pending: number): boolean {
  return pending > 0;
}

interface SyncCapableRegistration {
  sync?: { register(tag: string): Promise<void> };
}

/** Ask the browser to flush again after a signal returns. No-op where Background Sync is missing (iOS). */
export function registerCheckoutBackgroundSync(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready
    .then((registration) => {
      const sync = (registration as ServiceWorkerRegistration & SyncCapableRegistration).sync;
      if (!sync) return;
      return sync.register(CHECKOUT_BACKGROUND_SYNC_TAG);
    })
    .catch(() => undefined);
}
