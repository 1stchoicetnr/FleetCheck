import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.join(import.meta.dirname, "../..");

/** Tables that must be read and written only inside the org helper. */
const SCOPED_TABLES =
  "companies|vehicles|checkout_reports|fleet_alerts|app_users|app_feedback|fleet_settings|fleets|user_fleets";

export const SCOPED_QUERY =
  new RegExp(
    `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|FROM|JOIN)\\s+(${SCOPED_TABLES})\\b`,
    "i"
  );

const ALLOWED = new Set([
  path.normalize("src/lib/server/org-data.ts"),
  path.normalize("src/lib/server/org-stamp.ts"),
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      found.push(...sourceFiles(full));
      continue;
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    if (name.endsWith(".test.ts")) continue;
    found.push(full);
  }
  return found;
}

export function scopedQueriesOutsideHelper(root = ROOT): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(path.join(root, "src"))) {
    const rel = path.normalize(path.relative(root, file));
    if (ALLOWED.has(rel)) continue;
    const text = readFileSync(file, "utf8").replace(/\s+/g, " ");
    if (SCOPED_QUERY.test(text)) hits.push(rel);
  }
  return hits;
}

test("scoped tables are queried only inside the org helper", () => {
  assert.deepEqual(scopedQueriesOutsideHelper(), []);
});

test("the query check matches real statements and ignores schema DDL", () => {
  assert.match("SELECT id FROM vehicles WHERE org_id = $1", SCOPED_QUERY);
  assert.match("INSERT INTO checkout_reports (id) VALUES ($1)", SCOPED_QUERY);
  assert.match("UPDATE fleet_alerts SET read = true", SCOPED_QUERY);
  assert.match("DELETE FROM app_feedback WHERE id = $1", SCOPED_QUERY);
  assert.match("JOIN companies ON companies.id = vehicles.company_id", SCOPED_QUERY);
  assert.match("SELECT id FROM fleets WHERE org_id = $1", SCOPED_QUERY);
  assert.doesNotMatch("CREATE TABLE companies (", SCOPED_QUERY);
  assert.doesNotMatch(
    "CREATE INDEX IF NOT EXISTS checkout_reports_vehicle_idx ON checkout_reports (vehicle_id)",
    SCOPED_QUERY
  );
  assert.doesNotMatch("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS org_id TEXT", SCOPED_QUERY);
});
