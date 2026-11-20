import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { damageItemKeys, normalizeDamageText } from "./damage-keys.ts";
import { alertDamageDetails, alertDetailParts, repairSlackText } from "./alert-details.ts";
import {
  beforeAfterPairs,
  beforeAfterSlackLines,
  beforeCaption,
  damageCompareAngles,
  pairsForClient,
} from "./damage-before-after.ts";
import { insertAlert, listAlerts, setAlertsRead, type OrgDb } from "./server/org-data.ts";

const fmt = (iso: string) => iso.slice(0, 10);

type R = Parameters<typeof damageItemKeys>[0] & {
  id: string;
  completedAt: string;
  driverName: string;
  photos: Array<{ angle: string; flaggedDamage?: boolean; damageNote?: string; dataUrl?: string }>;
};

function check(id: string, completedAt: string, extra: Partial<R> = {}): R {
  return {
    id,
    completedAt,
    driverName: "Ken Taylor",
    photos: [],
    inspectionForm: null,
    ...extra,
  } as R;
}

const bumper = { damage: { front: "Bumper damage" } } as unknown as R["inspectionForm"];

// --- Damage keys (pick the photo slots for before/after) ------------------------------------------------------

test("damage text is keyed without case, extra spaces, or trailing punctuation", () => {
  assert.equal(normalizeDamageText("  Bumper   DAMAGE. "), "bumper damage");
  assert.equal(normalizeDamageText(undefined), "");
});

test("each damage item gets an area + item key", () => {
  const keys = damageItemKeys(
    check("a", "2026-11-19T15:11:00Z", {
      inspectionForm: {
        damage: { front: "Bumper damage", left: "", marks: ["left", "front"] },
        issueFlags: { needsRepair: true },
      } as unknown as R["inspectionForm"],
      photos: [
        { angle: "rear", flaggedDamage: true, damageNote: "Scratch" },
        { angle: "lf_fender", flaggedDamage: true },
        { angle: "rf_fender" },
      ],
    })
  );
  assert.deepEqual(keys, [
    "flag:needsrepair",
    "front|bumper damage",
    "left|marked",
    "rear|scratch",
    "lf_fender|flagged",
  ]);
});

test("alert details can be narrowed to some items", () => {
  const report = {
    photos: [{ angle: "rear" as const, flaggedDamage: true, damageNote: "Dent", dataUrl: "" }],
    inspectionForm: { damage: { front: "Bumper damage" } } as never,
  };
  assert.deepEqual(alertDetailParts(alertDamageDetails(report)), ["Rear photo (Dent)", "Front: Bumper damage"]);
  assert.deepEqual(alertDetailParts(alertDamageDetails(report, ["rear|dent"])), ["Rear photo (Dent)"]);
});

// --- Fix 3: before / after ----------------------------------------------------------------

test("form sides map to their photo slot", () => {
  assert.deepEqual(
    damageCompareAngles(["flag:safety", "front|bumper damage", "left|marked", "right|x", "rear|y", "lf_fender|flagged", "front|flagged"]),
    ["front", "driver_doors", "passenger_doors", "rear", "lf_fender"]
  );
});

test("before is the latest earlier check that has that slot; later checks never count", () => {
  const now = check("nov20", "2026-11-20T16:42:00Z", {
    inspectionForm: bumper,
    photos: [{ angle: "front", dataUrl: "https://x.private.blob.vercel-storage.com/n20-front.jpg" }],
  });
  const history = [
    check("nov19", "2026-11-19T15:11:00Z", { photos: [{ angle: "rear", dataUrl: "https://b/r.jpg" }] }),
    check("nov18", "2026-11-18T15:00:00Z", {
      driverName: "Amber",
      photos: [{ angle: "front", dataUrl: "https://x.private.blob.vercel-storage.com/n18-front.jpg" }],
    }),
    check("nov17", "2026-11-17T15:00:00Z", { photos: [{ angle: "front", dataUrl: "https://b/old.jpg" }] }),
    check("nov21", "2026-11-21T15:00:00Z", { photos: [{ angle: "front", dataUrl: "https://b/later.jpg" }] }),
  ];
  const [pair] = beforeAfterPairs(now, history, { keepStored: true });
  assert.equal(pair.angle, "front");
  assert.equal(pair.label, "Front");
  assert.equal(pair.before?.reportId, "nov18");
  assert.equal(pair.before?.driverName, "Amber");
  // Browser addresses go through the signed-in photo route, never the blob URL.
  assert.equal(pair.before?.src, "/api/checkout-reports/nov18/photos/front");
  assert.equal(pair.after?.src, "/api/checkout-reports/nov20/photos/front");
  assert.equal(pair.before?.stored, "https://x.private.blob.vercel-storage.com/n18-front.jpg");
  const [clientPair] = pairsForClient([pair]);
  assert.equal(clientPair.before?.stored, undefined);
  assert.equal(clientPair.after?.stored, undefined);
  assert.equal(beforeCaption(pair, fmt), "Before · 2026-11-18 · Amber");
});

test("no earlier photo of that slot says so", () => {
  const now = check("n", "2026-11-20T16:42:00Z", {
    photos: [{ angle: "rear", flaggedDamage: true, dataUrl: "https://b/r.jpg" }],
  });
  const pairs = beforeAfterPairs(now, [check("o", "2026-11-19T00:00:00Z", { photos: [{ angle: "front", dataUrl: "x" }] })]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].before, undefined);
  assert.equal(beforeCaption(pairs[0], fmt), "No earlier photo");
});

test("an alert's pairs follow its own items", () => {
  const now = check("n", "2026-11-20T16:42:00Z", {
    inspectionForm: bumper,
    photos: [{ angle: "rear", flaggedDamage: true, damageNote: "Dent", dataUrl: "https://b/r.jpg" }],
  });
  assert.deepEqual(beforeAfterPairs(now, [], { keys: ["rear|dent"] }).map((p) => p.angle), ["rear"]);
  assert.deepEqual(beforeAfterPairs(now, []).map((p) => p.angle), ["front", "rear"]);
});

test("Slack lines link the earlier check (sign-in required) and the post keeps its link", () => {
  const lines = beforeAfterSlackLines(
    [
      {
        angle: "front",
        label: "Front",
        before: { reportId: "nov19", src: "", completedAt: "2026-11-19T15:11:00Z", driverName: "Ken Taylor" },
        after: { reportId: "nov20", src: "", completedAt: "2026-11-20T16:42:00Z", driverName: "Ken Taylor" },
      },
      { angle: "rear", label: "Rear" },
    ],
    (id) => `https://app.test/office/${id}`,
    fmt
  );
  assert.deepEqual(lines, [
    "*Before / after:*",
    "• Front: <https://app.test/office/nov19|Before · 2026-11-19 · Ken Taylor> | After: this check",
    "• Rear: No earlier photo | After: no photo on this check",
  ]);
  assert.equal(beforeAfterSlackLines([], () => "", fmt).length, 0);
  const text = repairSlackText({
    unit: "Unit 8",
    vehicle: "2015 Toyota Camry",
    driverName: "Ken Taylor",
    alertLines: [],
    details: { issueFlags: [], photos: [], notes: ["Front: Bumper damage"], marks: [] },
    checkUrl: "https://app.test/office/nov20",
    extraLines: lines,
  });
  assert.ok(text.indexOf("*Before / after:*") < text.indexOf("Open the check"));
  assert.doesNotMatch(text, /blob\.vercel-storage/);
});

// --- Fix 1 storage: org-wide read (Postgres via PGlite) ---------------

const ORG = "org-test";

async function alertsDb(): Promise<{ pg: PGlite; db: OrgDb }> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE fleet_alerts (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL,
      vehicle_id TEXT NOT NULL, vehicle_plate TEXT NOT NULL, actor_name TEXT NOT NULL,
      report_id TEXT, created_at TIMESTAMPTZ NOT NULL, read BOOLEAN NOT NULL DEFAULT FALSE,
      archived_at TIMESTAMPTZ
    );
    -- An alert saved before this change (no new columns yet).
    INSERT INTO fleet_alerts VALUES
      ('old:damage_reported', '${ORG}', 'damage_reported', 'Damage reported on Unit 8', 'v8', 'Unit 8', 'Ken Taylor', 'old', '2026-11-19T15:11:00Z', false, NULL);
    -- Same additive migration the app runs.
    ALTER TABLE fleet_alerts ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
    ALTER TABLE fleet_alerts ADD COLUMN IF NOT EXISTS read_by TEXT;
  `);
  const db: OrgDb = {
    async query(text, params) {
      return (await pg.query(text, params)).rows as Record<string, unknown>[];
    },
  };
  return { pg, db };
}

test("old alerts read as unread; marking read is saved for everyone and scoped to the org", async () => {
  const { db } = await alertsDb();
  await insertAlert(db, "org-other", {
    id: "other:damage_reported", type: "damage_reported", message: "m", vehicleId: "v1",
    vehiclePlate: "U1", actorName: "A", reportId: "other", createdAt: "2026-11-20T00:00:00Z",
    read: false, archivedAt: null,
  });
  let [old] = await listAlerts(db, ORG);
  assert.equal(old.read, false);
  assert.equal(old.read_at, null);
  const updated = await setAlertsRead(db, ORG, ["old:damage_reported", "other:damage_reported"], true, "2026-11-20T17:00:00Z", "Ashley");
  assert.equal(updated.length, 1, "another org's alert is not touched");
  [old] = await listAlerts(db, ORG);
  assert.equal(old.read, true);
  assert.equal(old.read_by, "Ashley");
  assert.ok(old.read_at);
  const [other] = await listAlerts(db, "org-other");
  assert.equal(other.read, false);
  await setAlertsRead(db, ORG, ["old:damage_reported"], false, "2026-11-20T18:00:00Z", "Bell");
  [old] = await listAlerts(db, ORG);
  assert.equal(old.read, false);
  assert.equal(old.read_by, null);
  assert.deepEqual(await setAlertsRead(db, ORG, [], true, null, null), []);
});
