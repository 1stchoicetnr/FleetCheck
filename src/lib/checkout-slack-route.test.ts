import assert from "node:assert/strict";
import test from "node:test";
import { postCheckoutSlack } from "./checkout-slack.ts";
import {
  checkoutIsDamageOrFail,
  checkoutSlackUrl,
  defaultCheckoutSlackRoute,
  postsRepairSlack,
} from "./checkout-slack-route.ts";
import type { CheckoutReport } from "./types.ts";

const WEBHOOKS = {
  radcabcr: "https://hooks.example.test/radcabcr",
  ashleyDm: "https://hooks.example.test/ashley",
};

function report(partial: Partial<CheckoutReport> = {}): CheckoutReport {
  return {
    id: "cr-route",
    companyId: "company-turo",
    vehicleId: "vehicle-1",
    unitNumber: "4",
    plate: "TUR4",
    year: 2021,
    make: "Honda",
    model: "Civic",
    odometer: 1000,
    driverName: "Ada Lovelace",
    dispatcherName: "",
    type: "check_out",
    inspectionForm: {
      powertrain: "gas",
      fuelGauge: "half",
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
      trafficLight: "green",
      damage: {},
    },
    photos: [],
    status: "complete",
    completedAt: "2026-10-21T19:40:00.000Z",
    reviewStatus: "pending",
    flagged: false,
    synced: true,
    createdAt: "2026-10-21T19:40:00.000Z",
    ...partial,
  };
}

test("defaults post every Rad Cab check to #radcabcr and keep other fleets quiet", () => {
  assert.deepEqual(defaultCheckoutSlackRoute("company-rad-cab"), {
    mode: "every",
    destination: "radcabcr",
  });
  for (const id of [
    "company-1st-choice",
    "company-pinkie-tow",
    "company-turo",
    "company-other-fleets",
  ]) {
    assert.deepEqual(defaultCheckoutSlackRoute(id), {
      mode: "damage_or_fail",
      destination: "ashley_dm",
    });
  }
  assert.equal(postsRepairSlack("company-rad-cab"), true);
  assert.equal(postsRepairSlack("company-turo"), false);
});

test("a clean other-fleet check does not choose a webhook", () => {
  const clean = report();
  assert.equal(checkoutIsDamageOrFail(clean), false);
  assert.equal(
    checkoutSlackUrl(clean, defaultCheckoutSlackRoute(clean.companyId), WEBHOOKS),
    undefined
  );
});

test("damage or FAIL on another fleet uses the Ashley DM webhook", () => {
  const damage = report({
    photos: [
      {
        angle: "lf_fender",
        dataUrl: "https://blob.example/lf.jpg",
        capturedAt: "2026-10-21T19:40:00.000Z",
        flaggedDamage: true,
        damageNote: "scrape",
      },
    ],
  });
  const fail = report({
    inspectionForm: { ...report().inspectionForm!, trafficLight: "red" },
  });
  assert.equal(
    checkoutSlackUrl(damage, defaultCheckoutSlackRoute("company-pinkie-tow"), WEBHOOKS),
    WEBHOOKS.ashleyDm
  );
  assert.equal(
    checkoutSlackUrl(fail, defaultCheckoutSlackRoute("company-1st-choice"), WEBHOOKS),
    WEBHOOKS.ashleyDm
  );
  assert.equal(
    checkoutSlackUrl(damage, defaultCheckoutSlackRoute("company-turo"), {
      ...WEBHOOKS,
      radcabOverride: "https://hooks.example.test/override",
    }),
    WEBHOOKS.ashleyDm
  );
});

test("Rad Cab still posts a clean check to the Rad Cab webhook", async () => {
  const clean = report({
    companyId: "company-rad-cab",
    unitNumber: "12",
    plate: "RAD12",
  });
  const url = checkoutSlackUrl(clean, defaultCheckoutSlackRoute(clean.companyId), WEBHOOKS);
  assert.equal(url, WEBHOOKS.radcabcr);
  const calls: string[] = [];
  await postCheckoutSlack(clean, {
    webhookUrl: url as string,
    fetchImpl: async (target) => {
      calls.push(target);
      return { ok: true, text: async () => "ok" };
    },
  });
  assert.deepEqual(calls, [WEBHOOKS.radcabcr]);
});

test("Off sends nothing, and a missing DM webhook does not fall back to #radcabcr", () => {
  const damage = report({
    photos: [
      {
        angle: "front",
        dataUrl: "https://blob.example/front.jpg",
        capturedAt: "2026-10-21T19:40:00.000Z",
        flaggedDamage: true,
        damageNote: "dent",
      },
    ],
  });
  assert.equal(
    checkoutSlackUrl(damage, { mode: "off", destination: "ashley_dm" }, WEBHOOKS),
    undefined
  );
  assert.equal(
    checkoutSlackUrl(damage, defaultCheckoutSlackRoute("company-other-fleets"), {
      radcabcr: WEBHOOKS.radcabcr,
      ashleyDm: "",
    }),
    undefined
  );
});
