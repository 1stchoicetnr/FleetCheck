import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverOutboxItem,
  idempotencyKeyForDraft,
  scheduleOutboxFailure,
  type CheckoutOutboxItem,
  type OutboxTransport,
} from "./checkout-idempotency.ts";
import { sentBlockedByMissingPhotos } from "./checkout-completion.ts";
import {
  DRIVER_UPLOAD_WINDOW_MS,
  driverPhotoWindowClosed,
  isPhotoWindowClosedError,
  PHOTO_WINDOW_CLOSED_MESSAGE,
} from "./photo-window.ts";
import { isOfficeRole, outboxHeadline, outboxLines, outboxProblem } from "./outbox-summary.ts";
import { formatClientErrorLog } from "./api-log.ts";
import type { CheckoutReport } from "./types.ts";

function item(overrides: Partial<CheckoutOutboxItem> = {}): CheckoutOutboxItem {
  return {
    id: idempotencyKeyForDraft("cr-company-rad-cab-vehicle-11-check_out-user-ken"),
    draftId: "cr-company-rad-cab-vehicle-11-check_out-user-ken",
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    createdAt: "2026-11-06T14:27:00.000Z",
    uploadedTokens: {},
    companyId: "company-rad-cab",
    vehicleId: "vehicle-11",
    unitNumber: "11",
    plate: "CYR3806",
    year: 2016,
    make: "Chrysler",
    model: "200",
    odometer: 100,
    driverName: "Ken Taylor",
    dispatcherName: "Office",
    type: "check_out",
    photos: [
      { angle: "front", dataUrl: "data:image/jpeg;base64,AAAA", capturedAt: "2026-11-06T14:27:00.000Z" },
    ],
    ...overrides,
  };
}

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

const fakeReport = { id: "r1", sentAt: "2026-11-17T23:00:00.000Z" } as CheckoutReport;

test("driver photo window closes after 6 hours; bad dates count as closed", () => {
  const created = "2026-11-17T10:00:00.000Z";
  const t = Date.parse(created);
  assert.equal(driverPhotoWindowClosed(created, t + DRIVER_UPLOAD_WINDOW_MS - 1), false);
  assert.equal(driverPhotoWindowClosed(created, t + DRIVER_UPLOAD_WINDOW_MS + 1), true);
  assert.equal(driverPhotoWindowClosed("not a date", t), true);
  assert.equal(isPhotoWindowClosedError(PHOTO_WINDOW_CLOSED_MESSAGE), true);
  assert.equal(isPhotoWindowClosedError("Failed to save photo"), false);
});

test("a driver may send without photos only when asked and the window is closed", () => {
  assert.equal(sentBlockedByMissingPhotos(true, 5), false);
  assert.equal(sentBlockedByMissingPhotos(false, 0), false);
  assert.equal(sentBlockedByMissingPhotos(false, 5), true);
  assert.equal(sentBlockedByMissingPhotos(false, 5, { withoutPhotos: true, windowClosed: false }), true);
  assert.equal(sentBlockedByMissingPhotos(false, 5, { withoutPhotos: false, windowClosed: true }), true);
  assert.equal(sentBlockedByMissingPhotos(false, 5, { withoutPhotos: true, windowClosed: true }), false);
});

test("a closed photo window sends the check without photos and clears it from the phone", async () => {
  const calls: string[] = [];
  const transport: OutboxTransport = {
    async create() {
      throw new Error("should not create again");
    },
    async upload() {
      calls.push("upload");
      throw httpError(PHOTO_WINDOW_CLOSED_MESSAGE, 403);
    },
    async markSent() {
      calls.push("markSent");
      return fakeReport;
    },
    async markSentWithoutPhotos(id) {
      calls.push(`withoutPhotos:${id}`);
      return fakeReport;
    },
  };
  const saved: CheckoutOutboxItem[] = [];
  const result = await deliverOutboxItem(
    item({ serverReportId: "1793975257814-f7oawda" }),
    transport,
    async (next) => {
      saved.push(next);
    }
  );
  assert.equal(result.done, true);
  assert.equal(result.item.sentWithoutPhotos, true);
  assert.deepEqual(calls, ["upload", "withoutPhotos:1793975257814-f7oawda"]);
  assert.equal(saved.at(-1)?.sentWithoutPhotos, true);
});

test("other 403s still stop and wait for the office", async () => {
  const transport: OutboxTransport = {
    async create() {
      return fakeReport;
    },
    async upload() {
      throw httpError("You can only add photos to your own check.", 403);
    },
    async markSentWithoutPhotos() {
      throw new Error("must not be called");
    },
  };
  const result = await deliverOutboxItem(item({ serverReportId: "r1" }), transport, async () => {});
  assert.equal(result.done, false);
  assert.equal(result.item.permanent, true);
  assert.equal(result.item.lastStatus, 403);
  assert.equal(outboxProblem(result.item, true).kind, "office");
});

test("a signed-out failure keeps retrying and the banner asks to sign in", () => {
  const failed = scheduleOutboxFailure(item(), httpError("Sign in first.", 401), Date.now());
  assert.equal(failed.permanent, false);
  assert.equal(failed.lastStatus, 401);
  assert.deepEqual(outboxProblem(failed, true), { kind: "sign-in", text: "Sign in to finish uploading." });
  assert.equal(outboxProblem(item(), false).kind, "sign-in");
  const lines = outboxLines([failed], { signedIn: true, role: "driver" });
  assert.equal(outboxHeadline(lines, true), "Sign in to finish uploading.");
});

test("banner details list unit, driver, Pacific date and problem; only office roles may clear", () => {
  const server500 = scheduleOutboxFailure(
    item({ createdAt: "2026-10-21T00:31:00.000Z", photos: [] }),
    httpError("Failed to save photo", 500),
    Date.now()
  );
  const seenAt = new Date("2026-10-21T02:00:00.000Z");
  const driverLines = outboxLines([server500], { signedIn: true, role: "driver" }, seenAt);
  assert.equal(driverLines[0].unit, "Unit #11");
  assert.equal(driverLines[0].driver, "Ken Taylor");
  assert.equal(driverLines[0].when, "Oct 20, 5:31 PM");
  assert.match(driverLines[0].problem, /Server problem/);
  assert.equal(driverLines[0].canClear, false);
  assert.equal(outboxLines([server500], { signedIn: true, role: "management" })[0].canClear, true);
  assert.equal(outboxLines([server500], { signedIn: true, role: "super_admin" })[0].canClear, true);
  assert.equal(outboxLines([server500], { signedIn: false, role: "super_admin" })[0].canClear, false);
  assert.equal(isOfficeRole("tech"), false);
  const sameDay = new Date("2026-11-06T20:00:00.000Z");
  const waiting = item({
    id: "chk-other-123456",
    createdAt: "2026-11-06T18:00:00.000Z",
    signedAt: "2026-11-06T18:00:00.000Z",
  });
  assert.equal(
    outboxHeadline(
      outboxLines(
        [waiting, item({ id: "chk-second-123456", createdAt: waiting.createdAt, signedAt: waiting.signedAt })],
        { signedIn: true },
        sameDay
      ),
      true
    ),
    "2 checks didn't finish uploading. They are still on this phone."
  );
});

test("4xx log line names the check, the user and the error", () => {
  assert.equal(
    formatClientErrorLog(403, PHOTO_WINDOW_CLOSED_MESSAGE, {
      route: "photos",
      reportId: "1793975257814-f7oawda",
      userId: "WVbgqU2jId0o4pKG",
      userName: 'Ken "K" Taylor',
    }),
    `[api-4xx] status=403 route=photos report=1793975257814-f7oawda user=WVbgqU2jId0o4pKG name="Ken 'K' Taylor" error="This checkout is closed for new photos. Ask the office."`
  );
  assert.equal(
    formatClientErrorLog(401, "Sign in first.", { route: "photos", reportId: "x" }),
    `[api-4xx] status=401 route=photos report=x user=signed-out error="Sign in first."`
  );
});
