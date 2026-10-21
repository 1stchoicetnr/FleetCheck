import assert from "node:assert/strict";
import test from "node:test";
import { isCheckoutProbe, probeSlackWebhook } from "./checkout-probe.ts";

test("only the marked test checkout is a probe", () => {
  assert.equal(
    isCheckoutProbe({ driverName: "TEST Checkout", dispatcherName: "TEST probe" }),
    true
  );
  assert.equal(
    isCheckoutProbe({ driverName: " TEST Checkout ", dispatcherName: "TEST probe" }),
    true
  );
  assert.equal(
    isCheckoutProbe({ driverName: "TEST Checkout", dispatcherName: "Pat" }),
    false
  );
  assert.equal(
    isCheckoutProbe({ driverName: "TEST", dispatcherName: "TEST probe" }),
    false
  );
  assert.equal(
    isCheckoutProbe({ driverName: "Amber", dispatcherName: "TEST probe" }),
    false
  );
});

test("the probe uses the Ashley webhook and refuses the Rad Cab hooks", () => {
  assert.equal(
    probeSlackWebhook({
      feedback: "https://hooks.example.test/ashley",
      radcabcr: "https://hooks.example.test/radcabcr",
      repairs: "https://hooks.example.test/repairs",
    }),
    "https://hooks.example.test/ashley"
  );
  assert.throws(() =>
    probeSlackWebhook({
      feedback: "  ",
      radcabcr: "https://hooks.example.test/radcabcr",
    })
  );
  assert.throws(() =>
    probeSlackWebhook({
      feedback: "https://hooks.example.test/radcabcr",
      radcabcr: "https://hooks.example.test/radcabcr",
    })
  );
  assert.throws(() =>
    probeSlackWebhook({
      feedback: "https://hooks.example.test/repairs",
      repairs: "https://hooks.example.test/repairs",
    })
  );
});
