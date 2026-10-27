import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_SLACK_MAX,
  SlackDeliveryError,
  checkoutSlackText,
  postCheckoutSlack,
  postSlackMessage,
} from "./checkout-slack.ts";
import type { CheckoutReport, PhotoAngle } from "./types.ts";

const ORIGIN = "https://fleet.example.test";

function report(): CheckoutReport {
  return {
    id: "cr-sample",
    companyId: "company-rad-cab",
    vehicleId: "vehicle-12",
    unitNumber: "12",
    plate: "RAD12",
    year: 2022,
    make: "Toyota",
    model: "Camry",
    odometer: 145900,
    driverName: "Ada Lovelace",
    dispatcherName: "Pat",
    type: "check_out",
    inspectionForm: {
      powertrain: "gas",
      fuelGauge: "three_quarter",
      checks: {
        oil: { result: "ok" },
        tirePressure: { result: "ok" },
        headlights: { result: "ok" },
        brakeLights: { result: "ok" },
        hazardsTurnSignal: { result: "ok" },
        licensePlateTabs: { result: "ok" },
        fuelLevel: { result: "ok" },
      },
      interiorClean: "yes",
      exteriorClean: "yes",
      trafficLight: "yellow",
      damage: { left: "scrape" },
    },
    photos: [
      {
        angle: "windshield",
        dataUrl: "https://blob.example/windshield.jpg",
        capturedAt: "2026-10-21T19:30:00.000Z",
      },
      {
        angle: "lf_fender",
        dataUrl: "https://blob.example/lf-fender.jpg",
        capturedAt: "2026-10-21T19:31:00.000Z",
        flaggedDamage: true,
        damageNote: "scrape",
      },
      {
        angle: "rear",
        dataUrl: "data:image/jpeg;base64,aaaa",
        capturedAt: "2026-10-21T19:32:00.000Z",
      },
    ],
    status: "complete",
    completedAt: "2026-10-21T19:40:00.000Z",
    reviewStatus: "pending",
    flagged: true,
    synced: true,
    createdAt: "2026-10-21T19:40:00.000Z",
  };
}

test("checkout slack text names the check and links the PDF and photo gallery", () => {
  const text = checkoutSlackText(report(), { appOrigin: ORIGIN });
  assert.match(text, /\*Unit #:\* Unit 12 · RAD12/);
  assert.match(text, /\*Driver:\* Ada Lovelace/);
  assert.match(text, /\*Dispatcher:\* Pat/);
  assert.match(text, /\*Odometer:\* 145,900 mi/);
  assert.match(text, /\*Fuel:\* 3\/4/);
  assert.match(text, /\*Result:\* Conditional/);
  assert.match(text, /\*Time:\* Oct 21, 2026, 12:40 PM PT/);
  assert.match(text, /LF Fender · Ada Lovelace: scrape/);
  assert.match(text, /Left · Ada Lovelace: scrape/);
  assert.match(text, /\*PDF:\* https:\/\/fleet\.example\.test\/api\/checkout-reports\/cr-sample\/pdf/);
  assert.match(text, /\*Photos:\* https:\/\/fleet\.example\.test\/office\/cr-sample\/photos/);
  assert.equal(text.includes("blob.example"), false);
  assert.equal(text.includes("data:image"), false);
  assert.equal(text.length <= CHECKOUT_SLACK_MAX, true);
});

test("a missing dispatcher still leaves the line in the message", () => {
  const text = checkoutSlackText({ ...report(), dispatcherName: "  " }, { appOrigin: ORIGIN });
  assert.match(text, /\*Dispatcher:\* —/);
});

test("an office PASS overrides the traffic light", () => {
  const text = checkoutSlackText({ ...report(), reviewStatus: "pass" }, { appOrigin: ORIGIN });
  assert.match(text, /\*Result:\* PASS/);
});

test("a long damage list stays one message and keeps both links", () => {
  const angles: PhotoAngle[] = [
    "windshield",
    "front",
    "rear",
    "lf_fender",
    "rf_fender",
    "driver_doors",
    "passenger_doors",
    "lr_quarter_panel",
  ];
  const text = checkoutSlackText(
    {
      ...report(),
      photos: angles.map((angle) => ({
        angle,
        dataUrl: `https://blob.example/${angle}.jpg`,
        capturedAt: "2026-10-21T19:30:00.000Z",
        flaggedDamage: true,
        damageNote: "x".repeat(500),
      })),
    },
    { appOrigin: ORIGIN }
  );
  assert.equal(text.length <= CHECKOUT_SLACK_MAX, true);
  assert.match(text, /\/api\/checkout-reports\/cr-sample\/pdf/);
  assert.match(text, /\/office\/cr-sample\/photos/);
  assert.equal(text.includes("blob.example"), false);
  assert.match(text, /…/);
});

test("the webhook mock sends exactly one message, even when Slack returns a thread id", async () => {
  const calls: Array<{ url: string; body: { text?: string; thread_ts?: string } }> = [];
  const result = await postCheckoutSlack(report(), {
    webhookUrl: "https://hooks.example.test/radcab",
    appOrigin: ORIGIN,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, text: async () => JSON.stringify({ ts: "171111.0001", message: { ts: "171111.0001" } }) };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hooks.example.test/radcab");
  assert.equal(calls[0].body.thread_ts, undefined);
  assert.match(result.text, /\*Result:\* Conditional/);
  assert.match(result.text, /\/office\/cr-sample\/photos/);
  assert.equal(result.text.includes("blob.example"), false);
  assert.equal(result.text.length <= CHECKOUT_SLACK_MAX, true);
});

test("a failed webhook throws once and does not send a second message", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      postCheckoutSlack(report(), {
        webhookUrl: "https://hooks.example.test/radcab",
        fetchImpl: async () => {
          calls += 1;
          return { ok: false, status: 500, text: async () => "no" };
        },
      }),
    (err: unknown) => err instanceof SlackDeliveryError && err.message === "HTTP 500"
  );
  assert.equal(calls, 1);
});

test("a webhook timeout is a delivery error", async () => {
  await assert.rejects(
    () =>
      postSlackMessage("https://hooks.example.test/radcab", "hello", async () => {
        const err = new Error("timed out");
        err.name = "TimeoutError";
        throw err;
      }),
    (err: unknown) => err instanceof SlackDeliveryError && err.message === "timeout"
  );
});
