import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseCheckoutDraft,
  draftContentToCarry,
  draftIsPreviousPacificDay,
  draftMatchesVehicle,
  previousDayOutboxMessage,
} from "./checkout-draft-day.ts";
import { idempotencyKeyForCheck } from "./checkout-idempotency.ts";
import {
  loadServerReportsForOutbox,
  removeSentOutboxItems,
} from "./checkout-reconcile.ts";
import { deliveryView } from "./delivery-status.ts";
import { buildMyCheckRows } from "./my-check-rows.ts";
import { outboxHeadline, outboxLines } from "./outbox-summary.ts";
import type { CheckoutOutboxItem } from "./checkout-idempotency.ts";

/** 8:00 AM Pacific on Nov 26, 2026. The day before is Chris's check. */
const THIS_MORNING = new Date("2026-11-26T16:00:00.000Z");
const YESTERDAY_SIGNED = "2026-11-25T13:54:00.000Z";
const BASE_ID = "cr-company-vehicle-8-check_out-chris";
const SENT_ID = "1795614859689-9z1yfi2";

const YESTERDAY_COPY =
  "Yesterday's Unit 8 check is still sending. Tap Finish sending. This won't create a second report.";

function queued(overrides: Partial<CheckoutOutboxItem> = {}): CheckoutOutboxItem {
  return {
    id: "chk-unit-8",
    draftId: BASE_ID,
    attempts: 1,
    nextAttemptAt: YESTERDAY_SIGNED,
    createdAt: YESTERDAY_SIGNED,
    uploadedTokens: {},
    companyId: "company",
    vehicleId: "vehicle-8",
    unitNumber: "8",
    year: 2020,
    make: "Ford",
    model: "Transit",
    odometer: 100,
    driverName: "Chris Mirisciotta",
    dispatcherName: "Office",
    type: "check_out",
    signedAt: YESTERDAY_SIGNED,
    photos: [],
    ...overrides,
  };
}

test("reconcile removes an outbox item whose server report is sent", async () => {
  const sent = queued({ id: "chk-sent", serverReportId: SENT_ID, draftId: "draft-yesterday" });
  const stillUploading = queued({
    id: "chk-open",
    serverReportId: "report-open",
    draftId: "draft-open",
    createdAt: "2026-11-26T15:00:00.000Z",
    signedAt: "2026-11-26T15:00:00.000Z",
  });
  const localOnly = queued({ id: "chk-local", serverReportId: undefined, draftId: "draft-local" });
  const deletedOutbox: string[] = [];
  const deletedDrafts: string[] = [];
  const reports = await loadServerReportsForOutbox(
    [sent, stillUploading, localOnly],
    async () => [{ id: SENT_ID, sentAt: "2026-11-25T13:55:00.000Z" }],
    async (id) => {
      if (id === "report-open") return { id, sentAt: null };
      throw new Error("status unread");
    }
  );
  const removed = await removeSentOutboxItems(
    [sent, stillUploading, localOnly],
    reports,
    {
      deleteOutbox: async (id) => {
        deletedOutbox.push(id);
      },
      deleteDraft: async (id) => {
        deletedDrafts.push(id);
      },
    }
  );
  assert.deepEqual(removed.map((item) => item.id), ["chk-sent"]);
  assert.deepEqual(deletedOutbox, ["chk-sent"]);
  assert.deepEqual(deletedDrafts, ["draft-yesterday"]);

  const rows = buildMyCheckRows({
    outbox: [sent, stillUploading],
    local: [],
    remote: [
      {
        id: SENT_ID,
        sentAt: "2026-11-25T13:55:00.000Z",
        unitNumber: "8",
        year: 2020,
        make: "Ford",
        model: "Transit",
        createdAt: YESTERDAY_SIGNED,
      },
      {
        id: "report-open",
        unitNumber: "9",
        year: 2020,
        make: "Ford",
        model: "Transit",
        createdAt: "2026-11-26T15:00:00.000Z",
      },
    ],
    now: THIS_MORNING,
  });
  const sentRow = rows.find((row) => row.id === SENT_ID);
  assert.ok(sentRow);
  assert.equal(sentRow.unfinished, undefined);
  assert.equal(sentRow.sentAt, "2026-11-25T13:55:00.000Z");
  assert.equal(
    deliveryView({
      createdAt: sentRow.createdAt,
      sentAt: sentRow.sentAt,
      unfinished: sentRow.unfinished,
    }).label,
    "Sent"
  );
  assert.equal(rows.find((row) => row.id === "report-open")?.unfinished, true);
});

test("a status check marks a sent report that my-checks did not list", async () => {
  const item = queued({ serverReportId: SENT_ID });
  const reports = await loadServerReportsForOutbox(
    [item],
    async () => [],
    async (id) => ({ id, sentAt: "2026-11-25T13:55:00.000Z" })
  );
  const removed = await removeSentOutboxItems([item], reports, {
    deleteOutbox: async () => undefined,
    deleteDraft: async () => undefined,
  });
  assert.equal(removed.length, 1);
  const failed = await loadServerReportsForOutbox(
    [item],
    async () => {
      throw new Error("offline");
    },
    async () => {
      throw new Error("should not status-check when the list failed");
    }
  );
  assert.deepEqual(failed, []);
});

test("a previous-day draft is not reused", () => {
  const yesterday = {
    id: BASE_ID,
    updatedAt: YESTERDAY_SIGNED,
    signedAt: YESTERDAY_SIGNED,
    photos: { front: "data:image/jpeg;base64,yesterday" },
    signatureDataUrl: "data:image/png;base64,sig",
  };
  assert.equal(draftIsPreviousPacificDay(yesterday, THIS_MORNING), true);
  const choice = chooseCheckoutDraft({
    baseId: BASE_ID,
    drafts: [yesterday],
    waitingDraftIds: [],
    now: THIS_MORNING,
  });
  assert.notEqual(choice.id, BASE_ID);
  assert.match(choice.id, /2026-11-26$/);
  assert.equal(choice.reuseContent, false);
  assert.deepEqual(choice.deleteDraftIds, [BASE_ID]);
  const carried = draftContentToCarry(yesterday, choice.reuseContent);
  assert.deepEqual(carried.photos, {});
  assert.equal(carried.signatureDataUrl, undefined);
  assert.equal(carried.signedAt, undefined);
  assert.notEqual(
    idempotencyKeyForCheck(choice.id, carried.signedAt),
    idempotencyKeyForCheck(BASE_ID, yesterday.signedAt)
  );

  const stillSending = chooseCheckoutDraft({
    baseId: BASE_ID,
    drafts: [yesterday],
    waitingDraftIds: [BASE_ID],
    now: THIS_MORNING,
  });
  assert.equal(stillSending.reuseContent, false);
  assert.notEqual(stillSending.id, BASE_ID);
  assert.deepEqual(stillSending.deleteDraftIds, []);
});

test("unit 5 and unit 11 do not share a draft, even when both are Chrysler 200s", () => {
  const unit5 = "cr-company-vehicle-5-check_out-chris";
  const unit11 = "cr-company-vehicle-11-check_out-chris";
  const choice = chooseCheckoutDraft({
    baseId: unit11,
    drafts: [{ id: unit5, updatedAt: "2026-11-26T15:00:00.000Z", signedAt: "2026-11-26T15:10:00.000Z" }],
    waitingDraftIds: [],
    now: THIS_MORNING,
    editingId: unit5,
  });
  assert.equal(choice.reuseContent, false);
  assert.notEqual(choice.id, unit5);
  assert.equal(choice.id.startsWith(unit11), true);
  assert.equal(draftMatchesVehicle(choice.id, "vehicle-11"), true);
  assert.equal(draftMatchesVehicle(unit5, "vehicle-11"), false);
  assert.deepEqual(draftContentToCarry({ photos: { front: "unit-5-photo" } }, choice.reuseContent).photos, {});

  const same = chooseCheckoutDraft({
    baseId: unit11,
    drafts: [{ id: unit11, updatedAt: "2026-11-26T15:00:00.000Z" }],
    waitingDraftIds: [],
    now: THIS_MORNING,
    editingId: unit11,
  });
  assert.equal(same.id, unit11);
  assert.equal(same.reuseContent, true);
  assert.equal(
    draftContentToCarry({ photos: { rear: "unit-11-photo" } }, same.reuseContent).photos.rear,
    "unit-11-photo"
  );
});

test("same-day resume still works", () => {
  const signedAt = "2026-11-26T15:10:00.000Z";
  const today = {
    id: BASE_ID,
    updatedAt: "2026-11-26T15:00:00.000Z",
    signedAt,
    photos: { front: "data:image/jpeg;base64,today" },
    signatureDataUrl: "data:image/png;base64,sig",
  };
  assert.equal(draftIsPreviousPacificDay(today, THIS_MORNING), false);
  const choice = chooseCheckoutDraft({
    baseId: BASE_ID,
    drafts: [today],
    waitingDraftIds: [],
    now: THIS_MORNING,
  });
  assert.equal(choice.id, BASE_ID);
  assert.equal(choice.reuseContent, true);
  assert.deepEqual(choice.deleteDraftIds, []);
  const carried = draftContentToCarry(today, choice.reuseContent);
  assert.equal(carried.photos.front, "data:image/jpeg;base64,today");
  assert.equal(carried.signatureDataUrl, today.signatureDataUrl);
  assert.equal(carried.signedAt, signedAt);
  const inFlight = chooseCheckoutDraft({
    baseId: BASE_ID,
    drafts: [today],
    waitingDraftIds: [BASE_ID],
    now: THIS_MORNING,
  });
  assert.equal(inFlight.reuseContent, false);
  assert.notEqual(inFlight.id, BASE_ID);
  assert.deepEqual(draftContentToCarry(today, inFlight.reuseContent).photos, {});

  const justBeforeMidnight = new Date("2026-11-26T07:59:00.000Z");
  const justAfterMidnight = new Date("2026-11-26T08:01:00.000Z");
  const late = {
    id: BASE_ID,
    updatedAt: "2026-11-26T07:30:00.000Z",
  };
  assert.equal(draftIsPreviousPacificDay(late, justBeforeMidnight), false);
  assert.equal(draftIsPreviousPacificDay(late, justAfterMidnight), true);
});

test("the previous-day copy appears", () => {
  const item = queued({ unitNumber: "#8" });
  assert.equal(previousDayOutboxMessage(item, THIS_MORNING), YESTERDAY_COPY);
  assert.equal(
    previousDayOutboxMessage(
      {
        unitNumber: "8",
        signedAt: "2026-11-26T15:00:00.000Z",
        createdAt: YESTERDAY_SIGNED,
      },
      THIS_MORNING
    ),
    null
  );
  const lines = outboxLines([item], { signedIn: true, role: "driver" }, THIS_MORNING);
  assert.equal(lines[0].previousDayNote, YESTERDAY_COPY);
  assert.equal(outboxHeadline(lines, true), YESTERDAY_COPY);
  const rows = buildMyCheckRows({
    outbox: [item],
    local: [],
    remote: [],
    now: THIS_MORNING,
  });
  assert.equal(rows[0].note, YESTERDAY_COPY);
  assert.equal(rows[0].unfinished, true);
});
