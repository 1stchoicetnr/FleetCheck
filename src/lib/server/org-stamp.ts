/** Customer account that owns every fleet already in this database. */
export const FIRST_CHOICE_ORG_ID = "org-1st-choice-rad-cab";
export const FIRST_CHOICE_ORG_NAME = "1st Choice / Rad Cab";
export const FIRST_CHOICE_ORG_SLUG = "1st-choice-rad-cab";
const FIRST_CHOICE_ORG_CREATED_AT = "2026-10-20T00:00:00.000Z";

const TENANT_TABLES = [
  "companies",
  "vehicles",
  "checkout_reports",
  "fleet_alerts",
  "app_users",
  "app_feedback",
  "fleet_settings",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];
export type OrgCounts = Record<TenantTable, number>;

export type OrgStampResult = {
  orgId: string;
  before: OrgCounts;
  after: OrgCounts;
  filled: OrgCounts;
};

export type SqlRunner = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<T[]>;
};

export class OrgStampError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgStampError";
  }
}

function emptyCounts(): OrgCounts {
  return {
    companies: 0,
    vehicles: 0,
    checkout_reports: 0,
    fleet_alerts: 0,
    app_users: 0,
    app_feedback: 0,
    fleet_settings: 0,
  };
}

async function tableExists(db: SqlRunner, table: string): Promise<boolean> {
  const rows = await db.query<{ reg: string | null }>(
    "SELECT to_regclass($1) AS reg",
    [`public.${table}`]
  );
  return rows[0]?.reg != null;
}

async function countRows(db: SqlRunner, table: TenantTable): Promise<number> {
  const rows = await db.query<{ n: number | string }>(
    `SELECT COUNT(*)::int AS n FROM ${table}`
  );
  return Number(rows[0]?.n ?? 0);
}

async function nullOrgRows(db: SqlRunner, table: TenantTable): Promise<number> {
  const rows = await db.query<{ n: number | string }>(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE org_id IS NULL`
  );
  return Number(rows[0]?.n ?? 0);
}

async function snapshotCounts(db: SqlRunner, present: TenantTable[]): Promise<OrgCounts> {
  const counts = emptyCounts();
  for (const table of present) counts[table] = await countRows(db, table);
  return counts;
}

async function fingerprint(db: SqlRunner, present: Set<string>): Promise<string> {
  const parts: Record<string, unknown> = {};
  if (present.has("companies")) {
    parts.companies = await db.query(
      "SELECT id, name, slug FROM companies ORDER BY id"
    );
  }
  if (present.has("vehicles")) {
    parts.vehicles = await db.query(
      "SELECT id, company_id, plate FROM vehicles ORDER BY id"
    );
  }
  if (present.has("checkout_reports")) {
    parts.reports = await db.query(
      "SELECT id, company_id FROM checkout_reports ORDER BY id"
    );
  }
  return JSON.stringify(parts);
}

function countsEqual(a: OrgCounts, b: OrgCounts): boolean {
  return TENANT_TABLES.every((table) => a[table] === b[table]);
}

/**
 * Add the 1st Choice / Rad Cab org and stamp org_id.
 * Writes org_id only. Does not update company_id or any other column.
 * Sets NOT NULL only after counts and fleet ids match.
 */
export async function applyOrgStamp(db: SqlRunner): Promise<OrgStampResult> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `);
  await db.query(
    `INSERT INTO orgs (id, name, slug, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO NOTHING`,
    [
      FIRST_CHOICE_ORG_ID,
      FIRST_CHOICE_ORG_NAME,
      FIRST_CHOICE_ORG_SLUG,
      FIRST_CHOICE_ORG_CREATED_AT,
    ]
  );
  const orgRows = await db.query<{ id: string }>(
    "SELECT id FROM orgs WHERE slug = $1",
    [FIRST_CHOICE_ORG_SLUG]
  );
  const orgId = orgRows[0]?.id;
  if (!orgId) throw new OrgStampError("1st Choice / Rad Cab org was not created");

  const present: TenantTable[] = [];
  for (const table of TENANT_TABLES) {
    if (await tableExists(db, table)) present.push(table);
  }

  for (const table of present) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS org_id TEXT`);
  }

  const before = await snapshotCounts(db, present);
  const beforeIds = await fingerprint(db, new Set(present));
  const filled = emptyCounts();

  for (const table of present) {
    filled[table] = await nullOrgRows(db, table);
    await db.query(
      `UPDATE ${table} SET org_id = $1 WHERE org_id IS NULL`,
      [orgId]
    );
  }

  const after = await snapshotCounts(db, present);
  const afterIds = await fingerprint(db, new Set(present));
  if (!countsEqual(before, after) || beforeIds !== afterIds) {
    throw new OrgStampError(
      `Org stamp changed existing rows. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    );
  }

  for (const table of present) {
    const empty = await nullOrgRows(db, table);
    if (empty !== 0) {
      throw new OrgStampError(`${table} still has ${empty} rows with an empty org_id`);
    }
  }

  const orgLiteral = `'${orgId.replace(/'/g, "''")}'`;
  for (const table of present) {
    await db.query(`ALTER TABLE ${table} ALTER COLUMN org_id SET NOT NULL`);
    await db.query(
      `ALTER TABLE ${table} ALTER COLUMN org_id SET DEFAULT ${orgLiteral}`
    );
  }

  if (present.includes("checkout_reports")) {
    await db.query(
      `CREATE INDEX IF NOT EXISTS checkout_reports_org_completed_idx
       ON checkout_reports (org_id, completed_at)`
    );
  }
  if (present.includes("vehicles")) {
    await db.query(
      `CREATE INDEX IF NOT EXISTS vehicles_org_plate_idx
       ON vehicles (org_id, plate)`
    );
  }

  if (TENANT_TABLES.some((table) => filled[table] > 0)) {
    console.log(
      `[org-stamp] stamped ${orgId} before=${JSON.stringify(before)} after=${JSON.stringify(after)} filled=${JSON.stringify(filled)}`
    );
  }

  return { orgId, before, after, filled };
}
