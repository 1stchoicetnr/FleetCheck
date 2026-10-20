import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { restoreReplacedFrontPhoto, type OrgDb } from "./server/org-data.ts";

const ORG = "org-1st-choice-rad-cab";
const REPORT = "1792511911545-kehi03k";
const TEST_URL =
  "https://vgsmegupovts2rut.public.blob.vercel-storage.com/checkout/1792511911545-kehi03k/front-qpk4tUMrklIykPIKDop3I6elYvVv4r.jpg";
const ORIGINAL_URL =
  "https://vgsmegupovts2rut.public.blob.vercel-storage.com/checkout/1792511911545-kehi03k/front-2EFdktrQqgi7cVSdrKAc5UfFZYSUfH.jpg";

const SCHEMA = `
  CREATE TABLE checkout_reports (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    plate TEXT,
    odometer INT NOT NULL,
    photos JSONB NOT NULL
  );
`;

function runner(db: PGlite): OrgDb {
  return {
    async query(text, params) {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
  };
}

function photos(frontUrl: string) {
  return JSON.stringify([
    {
      angle: "passenger_front_in",
      dataUrl: "https://example.com/passenger.jpg",
      capturedAt: "2026-10-20T15:58:30.744Z",
    },
    {
      angle: "front",
      dataUrl: frontUrl,
      capturedAt: "2026-10-20T16:16:29.857Z",
      flaggedDamage: false,
    },
  ]);
}

async function seed(db: PGlite, frontUrl: string): Promise<void> {
  await db.exec(SCHEMA);
  await db.query(
    `INSERT INTO checkout_reports (id, org_id, company_id, plate, odometer, photos)
     VALUES ($1, $2, 'company-rad-cab', 'CNW8933', 1, $3::jsonb),
            ($4, $2, 'company-rad-cab', 'OTHER', 2, $5::jsonb)`,
    [REPORT, ORG, photos(frontUrl), "other-report", photos(TEST_URL)]
  );
}

async function row(db: PGlite, id: string) {
  const result = await db.query(
    "SELECT company_id, plate, odometer, photos FROM checkout_reports WHERE id = $1",
    [id]
  );
  return result.rows[0] as {
    company_id: string;
    plate: string;
    odometer: number;
    photos: Array<Record<string, unknown>>;
  };
}

test("replaces only the test front URL on that one report", async () => {
  const db = new PGlite();
  await seed(db, TEST_URL);
  const data = runner(db);
  assert.equal(await restoreReplacedFrontPhoto(data, ORG), true);
  const restored = await row(db, REPORT);
  assert.equal(restored.company_id, "company-rad-cab");
  assert.equal(restored.plate, "CNW8933");
  assert.equal(restored.odometer, 1);
  assert.equal(restored.photos[0].dataUrl, "https://example.com/passenger.jpg");
  assert.equal(restored.photos[0].capturedAt, "2026-10-20T15:58:30.744Z");
  assert.equal(restored.photos[1].angle, "front");
  assert.equal(restored.photos[1].dataUrl, ORIGINAL_URL);
  assert.equal(restored.photos[1].capturedAt, "2026-10-20T16:16:29.857Z");
  assert.equal(restored.photos[1].flaggedDamage, false);
  const other = await row(db, "other-report");
  assert.equal(other.photos[1].dataUrl, TEST_URL);
});

test("a second run and any other front URL write nothing", async () => {
  const db = new PGlite();
  await seed(db, TEST_URL);
  const data = runner(db);
  assert.equal(await restoreReplacedFrontPhoto(data, ORG), true);
  const once = JSON.stringify((await row(db, REPORT)).photos);
  assert.equal(await restoreReplacedFrontPhoto(data, ORG), false);
  assert.equal(JSON.stringify((await row(db, REPORT)).photos), once);

  const already = new PGlite();
  await seed(already, ORIGINAL_URL);
  assert.equal(await restoreReplacedFrontPhoto(runner(already), ORG), false);
  const left = await row(already, REPORT);
  assert.equal(left.photos[1].dataUrl, ORIGINAL_URL);
  assert.equal((await row(already, "other-report")).photos[1].dataUrl, TEST_URL);
});
