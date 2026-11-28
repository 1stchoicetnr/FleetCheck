import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_BACKGROUND_SYNC_TAG,
  FLUSH_OUTBOX_DONE_MESSAGE,
  FLUSH_OUTBOX_MESSAGE,
  OUTBOX_FLUSH_INTERVAL_MS,
  flushTriggerFires,
  isFlushOutboxDoneMessage,
  isFlushOutboxMessage,
  shouldRegisterBackgroundSync,
  type FlushTrigger,
} from "./checkout-flush.ts";

const TRIGGERS: FlushTrigger[] = ["mount", "interval", "visible", "online", "background-sync"];

test("an open app flushes on mount, on an interval, when it becomes visible, and when it comes online", () => {
  assert.equal(OUTBOX_FLUSH_INTERVAL_MS, 15_000);
  for (const trigger of TRIGGERS) {
    assert.equal(flushTriggerFires({ trigger, online: true, visible: true }), true, trigger);
  }
  assert.equal(flushTriggerFires({ trigger: "visible", online: true, visible: false }), false);
  assert.equal(flushTriggerFires({ trigger: "interval", online: true, visible: false }), true);
});

test("nothing flushes while the phone is offline", () => {
  for (const trigger of TRIGGERS) {
    assert.equal(flushTriggerFires({ trigger, online: false, visible: true }), false, trigger);
  }
});

test("background sync is registered only while a check is waiting, and the worker message is recognized", () => {
  assert.equal(shouldRegisterBackgroundSync(0), false);
  assert.equal(shouldRegisterBackgroundSync(2), true);
  assert.equal(CHECKOUT_BACKGROUND_SYNC_TAG, "inspekt-checkout-outbox");
  assert.equal(isFlushOutboxMessage({ type: FLUSH_OUTBOX_MESSAGE }), true);
  assert.equal(isFlushOutboxMessage({ type: "SKIP_WAITING" }), false);
  assert.equal(isFlushOutboxMessage(null), false);
  const done = { type: FLUSH_OUTBOX_DONE_MESSAGE, pending: 1 };
  assert.equal(isFlushOutboxDoneMessage(done), true);
  assert.equal(isFlushOutboxDoneMessage({ type: FLUSH_OUTBOX_DONE_MESSAGE }), false);
});
