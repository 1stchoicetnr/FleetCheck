import assert from "node:assert/strict";
import test from "node:test";
import { onFileDamage, type OnFileCheck } from "./on-file-damage.ts";
import {
  activeKnownCovers,
  findingMatchesOnFile,
  priorPhotoCheckDecisions,
  suppressPhotoFindings,
} from "./photo-check-on-file.ts";
import { knownNotFixingFromFinding, photoCheckOfficeDecision } from "./photo-check.ts";
import { runPhotoCheck, type PhotoCheckDeps } from "./photo-check-core.ts";
import type { KnownDamage } from "./known-damage.ts";

const known = (over: Partial<KnownDamage> = {}): KnownDamage => ({
  id: "kd_1",
  vehicleId: "v9",
  angle: "front",
  description: "front bumper damage",
  status: "not_fixing",
  createdAt: "2026-11-01T00:00:00Z",
  createdBy: "Office",
  ...over,
});

const check = (id: string, at: string, damage?: Record<string, string>, photos: OnFileCheck["photos"] = []): OnFileCheck => ({
  id,
  completedAt: at,
  driverName: "Ken",
  photos,
  inspectionForm: damage ? ({ damage } as never) : undefined,
});

test("same spot is suppressed, a different spot is raised, another unit is not", () => {
  const onFile = onFileDamage([], [known(), known({ id: "kd_rear", angle: "rear", description: "rear bumper damage" })], "2026-11-20T00:00:00Z");
  const findings = [
    { angle: "front", summary: "bumper damage" },
    { angle: "lf_fender", summary: "bumper crack" },
    { angle: "driver_doors", summary: "door dent" },
  ];
  assert.deepEqual(
    suppressPhotoFindings({ vehicleId: "v9", findings, onFile, decisions: [] }),
    ["front"]
  );
  assert.equal(
    findingMatchesOnFile(
      { vehicleId: "v8", angle: "front", summary: "bumper damage" },
      { vehicleId: "v9", angle: "front", description: "front bumper damage" }
    ),
    false
  );
  const otherUnit = onFileDamage([], [known({ vehicleId: "v8" })], "2026-11-20T00:00:00Z");
  assert.deepEqual(
    suppressPhotoFindings({
      vehicleId: "v9",
      findings: [{ angle: "front", summary: "bumper damage" }],
      onFile: otherUnit.map((item) => ({ ...item, vehicleId: "v8" })),
      decisions: [],
    }),
    [],
    "another unit's known damage does not suppress this unit"
  );
});

test("left-front body area matches a different slot with the same wording", () => {
  const onFile = onFileDamage(
    [],
    [known({ vehicleId: "v8", angle: "lf_corner", description: "left-front bumper crack" })],
    "2026-11-20T00:00:00Z"
  );
  assert.deepEqual(
    suppressPhotoFindings({
      vehicleId: "v8",
      findings: [
        { angle: "lf_fender", summary: "bumper crack" },
        { angle: "rear", summary: "bumper crack" },
      ],
      onFile,
      decisions: [],
    }),
    ["lf_fender"]
  );
});

test("unreviewed reported damage and an office decision suppress the same spot", () => {
  const prior = check("old", "2026-11-10T12:00:00Z", { front: "Bumper scrapes" });
  const onFile = onFileDamage([prior], [], "2026-11-20T12:00:00Z");
  assert.deepEqual(
    suppressPhotoFindings({
      vehicleId: "v9",
      findings: [{ angle: "front", summary: "bumper scrapes" }],
      onFile,
      decisions: [],
    }),
    ["front"]
  );
  const decisions = priorPhotoCheckDecisions(
    [
      {
        id: "old",
        completedAt: "2026-11-10T12:00:00Z",
        photos: [
          { angle: "rear", photoCheck: { summary: "bumper scrape", review: { verdict: "dismissed" } } },
          { angle: "front", photoCheck: { summary: "door dent", review: { verdict: "confirmed" } } },
        ],
      },
      {
        id: "later",
        completedAt: "2026-11-21T12:00:00Z",
        photos: [{ angle: "rear", photoCheck: { summary: "bumper scrape", review: { verdict: "dismissed" } } }],
      },
    ],
    "now",
    "2026-11-20T12:00:00Z"
  );
  assert.equal(decisions.length, 2, "a later check is not on file yet");
  assert.deepEqual(
    suppressPhotoFindings({
      vehicleId: "v9",
      findings: [
        { angle: "rear", summary: "bumper scrape" },
        { angle: "lf_corner", summary: "door dent" },
      ],
      onFile: [],
      decisions,
    }),
    ["rear"]
  );
});

test("a model summary that says new still matches the same spot", () => {
  const onFile = onFileDamage([], [known()], "2026-11-20T00:00:00Z");
  assert.deepEqual(
    suppressPhotoFindings({
      vehicleId: "v9",
      findings: [
        { angle: "front", summary: "New bumper damage" },
        { angle: "rear", summary: "another crack on the bumper" },
      ],
      onFile,
      decisions: [],
    }),
    ["front"]
  );
});

test("repaired known damage does not suppress a new find", () => {
  const onFile = onFileDamage(
    [],
    [known({ repairedAt: "2026-11-02T00:00:00Z" })],
    "2026-11-20T00:00:00Z"
  );
  assert.equal(onFile.length, 0);
  assert.deepEqual(
    suppressPhotoFindings({
      vehicleId: "v9",
      findings: [{ angle: "front", summary: "bumper damage" }],
      onFile,
      decisions: [],
    }),
    []
  );
});

test("Already known saves Known – not fixing and does not queue a post", () => {
  const decision = photoCheckOfficeDecision("already_known");
  assert.equal(decision.review, "already_known");
  assert.equal(decision.markKnown, true);
  assert.equal(decision.queueAlert, false);
  assert.equal(decision.flagDamage, false);
  const confirm = photoCheckOfficeDecision("confirm");
  assert.equal(confirm.queueAlert, true);
  assert.equal(confirm.markKnown, false);
  assert.equal(photoCheckOfficeDecision("dismiss").queueAlert, false);
  const input = knownNotFixingFromFinding({
    angle: "lf_corner",
    summary: "left-front bumper crack",
    reportId: "r1",
    alertId: "r1:photo_check",
  });
  assert.ok(!("error" in input));
  if ("error" in input) return;
  assert.equal(input.status, "not_fixing");
  assert.equal(input.angle, "lf_corner");
  assert.equal(input.description, "left-front bumper crack");
  assert.equal(input.sourceReportId, "r1");
  assert.equal(
    activeKnownCovers(
      [{ angle: "lf_corner", description: "left-front bumper crack", sourceReportId: "r1" }],
      { angle: "lf_corner", description: "New left-front bumper crack", sourceReportId: "r1" }
    ),
    true
  );
});

test("a suppressed photo-check finding is saved and not alerted; a different spot still is", async () => {
  const saved: Record<string, { changed: boolean; onFile?: string; summary: string }>[] = [];
  const alerts: { message: string }[] = [];
  const report = {
    id: "now",
    vehicleId: "v9",
    unitNumber: "9",
    plate: "P",
    completedAt: "2026-11-20T16:00:00Z",
    driverName: "Ken",
    photos: [
      { angle: "front", dataUrl: "blob:front" },
      { angle: "rear", dataUrl: "blob:rear" },
    ],
  };
  const history = [
    {
      id: "old",
      vehicleId: "v9",
      completedAt: "2026-11-01T16:00:00Z",
      driverName: "Mike",
      photos: [
        { angle: "front", dataUrl: "blob:front-old" },
        { angle: "rear", dataUrl: "blob:rear-old" },
      ],
    },
  ];
  const deps: PhotoCheckDeps = {
    settings: async () => ({ enabled: true, monthlyCapUsd: 10 }),
    spentThisMonth: async () => 0,
    knownDamage: async () => [],
    imageDataUrl: async (stored) => `data:${stored}`,
    token: async () => "test-token",
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body) as { messages: Array<{ content: Array<{ image_url?: { url: string } }> }> };
      const after = body.messages[0].content.at(-1)?.image_url?.url ?? "";
      const summary = after.includes("front") ? "bumper damage" : "door dent";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ changed: true, confidence: 0.9, summary, box: null }) } }],
          usage: { cost: 0.001 },
        }),
        text: async () => "",
      };
    },
    save: async (results) => void saved.push(results as never),
    insertAlert: async (alert) => void alerts.push(alert as { message: string }),
    now: () => new Date("2026-11-20T16:05:00Z"),
    alreadyOnFile: async (findings) => {
      const onFile = onFileDamage([], [known()], "2026-11-20T16:00:00Z");
      return suppressPhotoFindings({ vehicleId: "v9", findings, onFile, decisions: [] });
    },
  };
  const out = await runPhotoCheck("org-1", report as never, history as never, deps);
  assert.deepEqual(out.found, ["rear"]);
  assert.equal(saved[0].front.changed, false);
  assert.equal(saved[0].front.onFile, "already_on_file");
  assert.equal(saved[0].rear.changed, true);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].message, /door dent/);
  assert.doesNotMatch(alerts[0].message, /bumper damage/);
});
