import assert from "node:assert/strict";
import test from "node:test";
import { freshCheckoutDraftId, idempotencyKeyForDraft } from "./checkout-idempotency.ts";

test("a new check never reuses a draft that is still waiting to send", () => {
  const base = "cr-company-rad-cab-vehicle-11-check_out-user-amber";
  assert.equal(freshCheckoutDraftId(base, []), base);
  assert.equal(freshCheckoutDraftId(base, ["other"]), base);
  const fresh = freshCheckoutDraftId(base, [base], Date.parse("2026-11-18T19:00:00Z"));
  assert.notEqual(fresh, base);
  assert.ok(fresh.startsWith(`${base}-`));
  assert.notEqual(idempotencyKeyForDraft(fresh), idempotencyKeyForDraft(base));
});
