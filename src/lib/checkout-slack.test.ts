import assert from "node:assert/strict";
import test from "node:test";
import { checkoutSlackText, postCheckoutSlack } from "./checkout-slack.ts";
import type { CheckoutReport } from "./types.ts";

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

test("checkout slack text names the unit, people, odometer, fuel, result, time, and damage", () => {
  const text = checkoutSlackText(report(), { includePhotoLinks: true });
  assert.match(text, /\*Unit #:\* Unit 12 · RAD12/);
  assert.match(text, /\*Driver:\* Ada Lovelace/);
  assert.match(text, /\*Dispatcher:\* Pat/);
  assert.match(text, /\*Odometer:\* 145,900 mi/);
  assert.match(text, /\*Fuel:\* 3\/4/);
  assert.match(text, /\*Result:\* Conditional/);
  assert.match(text, /\*Time:\* Oct 21, 2026, 2:40 PM/);
  assert.match(text, /LF Fender: scrape/);
  assert.match(text, /Left: scrape/);
  assert.match(text, /Windshield: https:\/\/blob\.example\/windshield\.jpg/);
  assert.equal(text.includes("data:image"), false);
  assert.equal(text.trim().length > 0, true);
});

test("a missing dispatcher still leaves the line in the message", () => {
  const text = checkoutSlackText({ ...report(), dispatcherName: "  " });
  assert.match(text, /\*Dispatcher:\* —/);
});

test("an office PASS overrides the traffic light", () => {
  const text = checkoutSlackText({ ...report(), reviewStatus: "pass" });
  assert.match(text, /\*Result:\* PASS/);
});

test("the webhook mock never leaves the process, and a plain ok keeps photo links in the message", async () => {
  const calls: Array<{ url: string; body: { text?: string; thread_ts?: string } }> = [];
  const result = await postCheckoutSlack(report(), {
    webhookUrl: "https://hooks.example.test/radcab",
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, text: async () => "ok" };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hooks.example.test/radcab");
  assert.match(result.text, /Windshield: https:\/\/blob\.example\/windshield\.jpg/);
  assert.match(result.text, /\*Result:\* Conditional/);
  assert.equal(result.threaded, false);
  assert.equal(result.messages, 1);
});

test("the probe can post the parent once even when the webhook returns a thread id", async () => {
  const calls: string[] = [];
  const result = await postCheckoutSlack(report(), {
    webhookUrl: "https://hooks.example.test/ashley",
    allowThread: false,
    fetchImpl: async (_url, init) => {
      calls.push(init.body);
      return { ok: true, text: async () => JSON.stringify({ ts: "171111.0001" }) };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.threaded, false);
  assert.equal(result.messages, 1);
  assert.match(result.text, /LF Fender: scrape/);
});

test("a webhook that returns a thread id gets a labeled photo reply", async () => {
  const calls: Array<{ text?: string; thread_ts?: string; blocks?: unknown[] }> = [];
  const result = await postCheckoutSlack(report(), {
    webhookUrl: "https://hooks.example.test/radcab",
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, text: async () => JSON.stringify({ ts: "171111.0001" }) };
    },
  });
  assert.equal(result.threaded, true);
  assert.equal(calls[1].thread_ts, "171111.0001");
  assert.match(calls[1].text || "", /Windshield/);
  assert.match(calls[2].text || "", /LF Fender/);
  assert.equal(calls.length, 3);
});
