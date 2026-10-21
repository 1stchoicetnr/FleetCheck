import assert from "node:assert/strict";
import test from "node:test";
import { companyUsesClover } from "./company-rules.ts";
import { PHOTO_ANGLES, walkaroundPhotoSteps } from "./types.ts";
import {
  CompanySettingsError,
  isCompanyEnabled,
  mergeCompanySettings,
  photoStepsForCompany,
  publicCompanySettings,
  usesClover,
} from "./company-settings.ts";

const COMPANIES = [
  "company-rad-cab",
  "company-1st-choice",
  "company-turo",
  "company-pinkie-tow",
  "company-other-fleets",
];

test("an empty settings record matches today's fleets, photos, and Clover", () => {
  const view = publicCompanySettings(null);
  assert.equal(view.usingDefaults, true);
  assert.equal(view.slackWebhookSet, false);
  assert.equal(view.pdfLogoDataUrl, null);
  assert.deepEqual(view.cloverCompanyIds, ["company-rad-cab"]);
  assert.equal(JSON.stringify(view).includes("hooks.slack.com"), false);
  assert.deepEqual(view.checkoutSlack["company-rad-cab"], {
    mode: "every",
    destination: "radcabcr",
  });
  assert.deepEqual(view.checkoutSlack["company-1st-choice"], {
    mode: "damage_or_fail",
    destination: "ashley_dm",
  });
  assert.deepEqual(view.checkoutSlack["company-turo"], view.checkoutSlack["company-1st-choice"]);
  assert.deepEqual(view.checkoutSlack["company-pinkie-tow"], view.checkoutSlack["company-turo"]);
  assert.deepEqual(view.checkoutSlack["company-other-fleets"], view.checkoutSlack["company-turo"]);
  const expected = walkaroundPhotoSteps(PHOTO_ANGLES);
  for (const companyId of COMPANIES) {
    assert.equal(usesClover(view, companyId), companyUsesClover(companyId));
    assert.equal(isCompanyEnabled(view, companyId), true);
    const actual = photoStepsForCompany(view, companyId);
    const docsOn = companyId === "company-rad-cab";
    assert.deepEqual(
      actual.map((step) => [step.angle, step.required]),
      expected.map((step) => [
        step.angle,
        step.angle === "registration" || step.angle === "insurance"
          ? docsOn
          : step.required,
      ])
    );
  }
  assert.equal(/\bvan\b/i.test(JSON.stringify(view.fleetTypes)), false);
});

test("photo, Clover, and Slack changes are stored, and a matching edit clears them", () => {
  const optional = mergeCompanySettings(null, {
    photos: { taxi: { front: false } },
  });
  assert.equal(optional?.photoRequired?.taxi?.front, false);
  assert.equal(publicCompanySettings(optional).photos.taxi.front, false);
  assert.equal(publicCompanySettings(optional).photos.tow.front, true);
  const restored = mergeCompanySettings(optional, {
    photos: { taxi: { front: true } },
  });
  assert.equal(restored, null);

  const cloverOff = mergeCompanySettings(null, { cloverCompanyIds: [] });
  assert.deepEqual(cloverOff?.cloverCompanyIds, []);
  assert.equal(usesClover(publicCompanySettings(cloverOff), "company-rad-cab"), false);

  const hidden = mergeCompanySettings(null, {
    fleetTypes: [
      { id: "taxi", label: "Taxi", enabled: true },
      { id: "tow", label: "Tow Trucks", enabled: false },
      { id: "turo", label: "Turo", enabled: true },
      { id: "service_vehicle", label: "Service Vehicles", enabled: true },
    ],
  });
  const view = publicCompanySettings(hidden);
  assert.equal(isCompanyEnabled(view, "company-rad-cab"), true);
  assert.equal(isCompanyEnabled(view, "company-1st-choice"), false);
  assert.equal(isCompanyEnabled(view, "company-pinkie-tow"), false);

  const hooked = mergeCompanySettings(null, {
    slackWebhook: "https://hooks.slack.com/services/T000/B000/secretvalue",
  });
  const published = publicCompanySettings(hooked);
  assert.equal(published.slackWebhookSet, true);
  assert.equal(JSON.stringify(published).includes("secretvalue"), false);
  assert.equal(mergeCompanySettings(hooked, { clearSlackWebhook: true })?.slackWebhook, "");
  assert.throws(
    () => mergeCompanySettings(null, { slackWebhook: "https://example.com/hook" }),
    CompanySettingsError
  );
});

test("checkout Slack routes store only fleets that differ from the default", () => {
  const changed = mergeCompanySettings(null, {
    checkoutSlack: { "company-turo": { mode: "off", destination: "radcabcr" } },
  });
  assert.equal(changed?.checkoutSlack?.["company-turo"]?.mode, "off");
  assert.equal(changed?.checkoutSlack?.["company-rad-cab"], undefined);
  assert.equal(publicCompanySettings(changed).checkoutSlack["company-turo"].destination, "radcabcr");
  assert.equal(publicCompanySettings(changed).usingDefaults, false);
  assert.equal(
    mergeCompanySettings(changed, {
      checkoutSlack: { "company-turo": { mode: "damage_or_fail", destination: "ashley_dm" } },
    }),
    null
  );
});
