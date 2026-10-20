import assert from "node:assert/strict";
import test from "node:test";
import { deliveryView, isStuckUpload, STUCK_UPLOAD_AFTER_MS } from "./delivery-status.ts";

const created = "2026-10-20T20:00:00.000Z";
const now = Date.parse(created) + STUCK_UPLOAD_AFTER_MS + 1;

test("a check moves from the phone to uploading to sent", () => {
  assert.equal(deliveryView({ createdAt: created, localOnly: true }).label, "Saved on phone");
  assert.equal(
    deliveryView({ createdAt: created, now: Date.parse(created) + 1000 }).state,
    "uploading"
  );
  const sent = deliveryView({
    createdAt: created,
    sentAt: "2026-10-20T20:05:00.000Z",
    now,
  });
  assert.equal(sent.state, "sent");
  assert.equal(sent.at, "2026-10-20T20:05:00.000Z");
});

test("checks from before the sent column existed stay sent", () => {
  const old = deliveryView({
    createdAt: "2026-10-20T19:00:00.000Z",
    now: Date.parse("2026-10-21T12:00:00.000Z"),
  });
  assert.equal(old.state, "sent");
  assert.equal(
    isStuckUpload({ createdAt: "2026-10-20T19:00:00.000Z" }, Date.parse("2026-10-21T12:00:00.000Z")),
    false
  );
});

test("an office row with no sent time is flagged once it sits too long", () => {
  assert.equal(deliveryView({ createdAt: created, now: Date.parse(created) + 1000 }).state, "uploading");
  assert.equal(deliveryView({ createdAt: created, now }).state, "stuck");
  assert.equal(isStuckUpload({ createdAt: created, sentAt: created }, now), false);
  assert.equal(isStuckUpload({ createdAt: created, archivedAt: created }, now), false);
  assert.equal(isStuckUpload({ createdAt: created }, now), true);
});
