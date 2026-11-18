import assert from "node:assert/strict";
import test from "node:test";
import { classifyStuckChecks, STUCK_AFTER_MS, type StuckCandidate } from "./stuck-checks.ts";
import { photoSavedLog } from "./photo-log.ts";
import type { PhotoStep } from "./types.ts";

const steps = [
  { angle: "front", label: "Front", required: true },
  { angle: "rear", label: "Rear", required: true },
] as unknown as PhotoStep[];
const now = Date.parse("2026-11-17T23:30:00.000Z");

function check(id: string, extra: Partial<StuckCandidate>): StuckCandidate {
  return {
    id,
    unitNumber: "11",
    plate: "CYR3806",
    driverName: "Ken Taylor",
    companyId: "company-rad-cab",
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    idempotencyKey: "chk-abcdefgh12345",
    photos: [],
    ...extra,
  } as StuckCandidate;
}

test("stuck page lists unsent checks over 30 minutes and checks sent without photos", () => {
  const result = classifyStuckChecks(
    [
      check("unsent-old", {}),
      check("unsent-new", { createdAt: new Date(now - STUCK_AFTER_MS + 1000).toISOString() }),
      check("sent-empty", { sentAt: new Date(now - 60_000).toISOString() }),
      check("sent-full", {
        sentAt: new Date(now - 60_000).toISOString(),
        photos: [
          { angle: "front", dataUrl: "stored", capturedAt: "x" },
          { angle: "rear", dataUrl: "stored", capturedAt: "x" },
        ] as never,
      }),
      check("archived", { archivedAt: new Date(now).toISOString() }),
    ],
    () => steps,
    now
  );
  assert.deepEqual(result.stuck.map((r) => r.id), ["unsent-old"]);
  assert.equal(result.stuck[0].missingPhotos, 2);
  assert.equal(result.stuck[0].hoursWaiting, 3);
  assert.match(result.stuck[0].reason, /Missing 2 photos/);
  assert.deepEqual(result.sentWithoutPhotos.map((r) => r.id), ["sent-empty"]);
  assert.equal(result.sentWithoutPhotos[0].reason, "Sent without 2 required photos");
});

test("each saved photo batch logs one line with count, size and time", () => {
  const line = photoSavedLog({
    reportId: "r1",
    userId: "u1",
    office: false,
    photos: [
      { angle: "front", dataUrl: "data:image/jpeg;base64," + "A".repeat(4096) },
      { angle: "rear", dataUrl: "https://blob/x.jpg" },
    ],
    ms: 812.4,
    stored: 2,
    sent: false,
  });
  assert.equal(
    line,
    "[photo-saved] report=r1 user=u1 by=driver count=2 angles=front,rear kb=3 ms=812 stored=2 sent=no"
  );
});
