import assert from "node:assert/strict";
import test from "node:test";
import { queuedCaptureTime, resolveQueuedDriver, QUEUED_CAPTURE_MAX_AGE_MS } from "./queued-driver.ts";
import { idempotencyKeyForDraft, originalDriverFields, type CheckoutOutboxItem } from "./checkout-idempotency.ts";

const ken = { id: "WVbgqU2jId0o4pKG", name: "Ken Taylor" };
const bell = { userId: "udMtiPIOav_Fp57q", name: "Bell", office: true };
const amber = { userId: "amber-id", name: "Amber Talley", office: false };

test("the same driver sending their own queued check is unchanged", () => {
  const r = resolveQueuedDriver({
    signer: { userId: ken.id, name: ken.name, office: false },
    original: { userId: ken.id, name: ken.name },
  });
  assert.deepEqual(r, { ok: true, driverName: "Ken Taylor", driverUserId: ken.id, kept: false });
});

test("office sending Ken's queued check keeps Ken as the driver", () => {
  const r = resolveQueuedDriver({ signer: bell, original: { userId: ken.id, name: "Ken" }, originalUser: ken });
  assert.deepEqual(r, { ok: true, driverName: "Ken Taylor", driverUserId: ken.id, kept: true });
});

test("another driver cannot send Ken's queued check under their own name", () => {
  const r = resolveQueuedDriver({ signer: amber, original: { userId: ken.id, name: "Ken Taylor" }, originalUser: ken });
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /started by Ken Taylor/);
});

test("old queued checks with only a name: office keeps the name, a different driver is refused", () => {
  const office = resolveQueuedDriver({ signer: bell, original: { name: "Ken Taylor" } });
  assert.deepEqual(office, { ok: true, driverName: "Ken Taylor", driverUserId: undefined, kept: true });
  assert.equal(resolveQueuedDriver({ signer: amber, original: { name: "Ken Taylor" } }).ok, false);
  // Same name, different case: same person.
  assert.equal(
    resolveQueuedDriver({ signer: { userId: ken.id, name: "ken taylor", office: false }, original: { name: "Ken Taylor" } }).ok,
    true
  );
  // Generic old names ("Driver") cannot be trusted, so the signer is used as before.
  const generic = resolveQueuedDriver({ signer: amber, original: { name: "Driver" } });
  assert.deepEqual(generic, { ok: true, driverName: "Amber Talley", driverUserId: "amber-id", kept: false });
});

test("capture time is kept when sane, otherwise the server time is used", () => {
  const now = Date.parse("2026-11-17T23:00:00.000Z");
  assert.equal(queuedCaptureTime("2026-10-21T00:31:00.000Z", now), "2026-10-21T00:31:00.000Z");
  assert.equal(queuedCaptureTime("2026-11-18T23:00:00.000Z", now), undefined);
  assert.equal(queuedCaptureTime(new Date(now - QUEUED_CAPTURE_MAX_AGE_MS - 1).toISOString(), now), undefined);
  assert.equal(queuedCaptureTime("nope", now), undefined);
  assert.equal(queuedCaptureTime(undefined, now), undefined);
});

test("the phone sends the original driver and capture time with the create call", () => {
  const item = {
    id: idempotencyKeyForDraft("cr-x-vehicle-11-check_out-user-ken"),
    driverName: "Ken Taylor",
    driverUserId: ken.id,
    capturedAt: "2026-11-06T14:27:00.000Z",
    signedAt: "2026-11-06T14:26:00.000Z",
    createdAt: "2026-11-06T14:27:05.000Z",
  } as CheckoutOutboxItem;
  assert.deepEqual(originalDriverFields(item), {
    originalDriverUserId: ken.id,
    originalDriverName: "Ken Taylor",
    capturedAt: "2026-11-06T14:27:00.000Z",
  });
  // Items queued before this change have no capturedAt or user id.
  const old = { ...item, driverUserId: undefined, capturedAt: undefined } as CheckoutOutboxItem;
  assert.equal(originalDriverFields(old).capturedAt, "2026-11-06T14:26:00.000Z");
  assert.equal(originalDriverFields(old).originalDriverUserId, undefined);
});
