import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  acceptLink,
  classifySignIn,
  issueLink,
} from "./server/auth-accounts.ts";
import {
  normalizeAccessEmail,
  normalizePhone,
  reviewAccessRequest,
  submitAccessRequest,
} from "./server/access-requests.ts";
import { accessRequestLimited, recordAccessRequest, resetAccessLimits } from "./server/access-limit.ts";
import { postAccessRequestToSlack } from "./server/access-slack.ts";
import { anyOwnerHasPassword, listPeople, listUserFleetIds, setUserPassword, type OrgDb } from "./server/org-data.ts";
import { hashPassword } from "./server/password.ts";
import {
  assertOfficePin,
  isOfficeRequest,
  OfficeAuthError,
  resetPinFallbackCheck,
  setPinFallbackCheck,
} from "./server/office-pin.ts";

const ORG = "org-1st-choice-rad-cab";

const SCHEMA = `
  CREATE TABLE app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    org_id TEXT NOT NULL,
    password_hash TEXT,
    phone TEXT,
    access_status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE org_memberships (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (org_id, user_id)
  );
  CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE auth_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    user_id TEXT,
    email TEXT,
    name TEXT,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    fleet_ids TEXT
  );
  CREATE TABLE fleets (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE user_fleets (
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    fleet_id TEXT NOT NULL,
    PRIMARY KEY (org_id, user_id, fleet_id)
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

async function seed(db: PGlite) {
  await db.exec(SCHEMA);
  await db.query(
    `INSERT INTO app_users (id, name, email, role, active, created_at, org_id)
     VALUES ('user-ashley', 'Ashley', 'ashley@warecovery.com', 'super_admin', true, NOW(), $1)`,
    [ORG]
  );
  await db.query(
    `INSERT INTO org_memberships (id, org_id, user_id, role, created_at)
     VALUES ('member-user-ashley', $1, 'user-ashley', 'owner', NOW())`,
    [ORG]
  );
  await db.query(
    `INSERT INTO fleets (id, org_id, company_id, name, type, created_at)
     VALUES ('fleet-rad-cab', $1, 'company-rad-cab', 'Rad Cab', 'taxi', NOW())`,
    [ORG]
  );
}

test("access emails and phone numbers are checked", () => {
  assert.equal(normalizeAccessEmail("  Pat@Example.com "), "pat@example.com");
  assert.throws(() => normalizeAccessEmail("not-an-email"), /valid email/);
  assert.throws(() => normalizeAccessEmail("a@b"), /valid email/);
  assert.equal(normalizePhone(" (555) 010-0199 "), "(555) 010-0199");
  assert.throws(() => normalizePhone("123"), /phone number/);
});

test("access requests are rate limited separately from sign-in", () => {
  resetAccessLimits();
  const now = Date.now();
  for (let i = 0; i < 5; i += 1) recordAccessRequest("198.51.100.8", now);
  assert.equal(accessRequestLimited("198.51.100.8", now), true);
  assert.equal(accessRequestLimited("198.51.100.9", now), false);
  assert.equal(accessRequestLimited("198.51.100.8", now + 16 * 60 * 1000), false);
  resetAccessLimits();
});

test("a new request waits, a repeat does not create another row, and sign-in shows that status", async () => {
  const pg = new PGlite();
  await seed(pg);
  const db = runner(pg);
  const first = await submitAccessRequest(db, ORG, {
    name: "Sam Rivera",
    email: "Sam.Rivera@example.com",
    phone: "555-010-0199",
    password: "long-enough-password",
  });
  assert.equal(first.created, true);
  assert.equal(first.status, "pending");
  const again = await submitAccessRequest(db, ORG, {
    name: "Sam Rivera",
    email: "sam.rivera@example.com",
    phone: "555-010-0199",
    password: "another-long-password",
  });
  assert.equal(again.created, false);
  assert.equal(again.status, "pending");
  const rows = await db.query("SELECT id FROM app_users WHERE lower(email) = 'sam.rivera@example.com'");
  assert.equal(rows.length, 1);
  const people = await listPeople(db, ORG);
  assert.equal(people.some((person) => person.email === "sam.rivera@example.com"), false);
  const pending = await classifySignIn(db, ORG, "sam.rivera@example.com", "long-enough-password");
  assert.equal(pending.kind, "pending");
  const wrong = await classifySignIn(db, ORG, "sam.rivera@example.com", "not-the-password");
  assert.equal(wrong.kind, "invalid");
  await pg.close();
});

test("office cannot approve or grant owner, and a manager stays inside assigned fleets", async () => {
  const pg = new PGlite();
  await seed(pg);
  const db = runner(pg);
  const created = await submitAccessRequest(db, ORG, {
    name: "Sam Rivera",
    email: "sam.rivera@example.com",
    phone: "555-010-0199",
    password: "long-enough-password",
  });
  assert.equal(created.created, true);
  const pending = await db.query(
    "SELECT id FROM app_users WHERE lower(email) = 'sam.rivera@example.com'"
  );
  const userId = String(pending[0].id);
  await assert.rejects(
    () =>
      reviewAccessRequest(db, {
        orgId: ORG,
        userId,
        action: "approve",
        role: "driver",
        fleetIds: ["fleet-rad-cab"],
        actorRole: "office",
      }),
    (err: unknown) => err instanceof Error && /Manager access is required/.test(err.message)
  );
  await assert.rejects(
    () =>
      reviewAccessRequest(db, {
        orgId: ORG,
        userId,
        action: "approve",
        role: "owner",
        fleetIds: ["fleet-rad-cab"],
        actorRole: "manager",
        actorFleetIds: ["fleet-rad-cab"],
      }),
    (err: unknown) => err instanceof Error && /Only an owner/.test(err.message)
  );
  await assert.rejects(
    () =>
      reviewAccessRequest(db, {
        orgId: ORG,
        userId,
        action: "approve",
        role: "driver",
        fleetIds: ["fleet-turo"],
        actorRole: "manager",
        actorFleetIds: ["fleet-rad-cab"],
      }),
    (err: unknown) => err instanceof Error && /inside your own fleets/.test(err.message)
  );
  await reviewAccessRequest(db, {
    orgId: ORG,
    userId,
    action: "approve",
    role: "driver",
    fleetIds: ["fleet-rad-cab"],
    actorRole: "owner",
  });
  const signedIn = await classifySignIn(db, ORG, "sam.rivera@example.com", "long-enough-password");
  assert.equal(signedIn.kind, "ok");
  if (signedIn.kind === "ok") assert.equal(signedIn.user.role, "driver");
  assert.deepEqual(await listUserFleetIds(db, ORG, userId), ["fleet-rad-cab"]);

  const deniedRequest = await submitAccessRequest(db, ORG, {
    name: "Dee Nied",
    email: "dee.nied@example.com",
    phone: "555-010-0100",
    password: "long-enough-password",
  });
  assert.equal(deniedRequest.created, true);
  const deniedRow = await db.query(
    "SELECT id FROM app_users WHERE lower(email) = 'dee.nied@example.com'"
  );
  await reviewAccessRequest(db, {
    orgId: ORG,
    userId: String(deniedRow[0].id),
    action: "deny",
    actorRole: "manager",
    actorFleetIds: ["fleet-rad-cab"],
  });
  const denied = await classifySignIn(db, ORG, "dee.nied@example.com", "long-enough-password");
  assert.equal(denied.kind, "denied");
  const membership = await db.query(
    "SELECT role FROM org_memberships WHERE user_id = $1",
    [deniedRow[0].id]
  );
  assert.deepEqual(membership, []);
  const repeat = await submitAccessRequest(db, ORG, {
    name: "Dee Nied",
    email: "dee.nied@example.com",
    phone: "555-010-0100",
    password: "long-enough-password",
  });
  assert.equal(repeat.status, "denied");
  assert.equal(repeat.created, false);
  await pg.close();
});

test("invite links still skip approval and setup links still set a password", async () => {
  const pg = new PGlite();
  await seed(pg);
  const db = runner(pg);
  const invite = await issueLink(db, {
    orgId: ORG,
    kind: "invite",
    role: "driver",
    email: "invited@example.com",
    name: "Invited Driver",
  });
  const created = await acceptLink(db, invite.token, "long-enough-password");
  const signedIn = await classifySignIn(db, ORG, "invited@example.com", "long-enough-password");
  assert.equal(signedIn.kind, "ok");
  assert.equal(created.role, "driver");
  const row = await db.query(
    "SELECT access_status, active FROM app_users WHERE id = $1",
    [created.id]
  );
  assert.equal(row[0].access_status, "active");
  assert.equal(row[0].active, true);

  assert.equal(await anyOwnerHasPassword(db, ORG), false);
  const setup = await issueLink(db, {
    orgId: ORG,
    kind: "setup",
    role: "owner",
    userId: "user-ashley",
    email: "ashley@warecovery.com",
    name: "Ashley",
  });
  await acceptLink(db, setup.token, "owner-long-password");
  assert.equal(await anyOwnerHasPassword(db, ORG), true);
  const owner = await classifySignIn(db, ORG, "ashley@warecovery.com", "owner-long-password");
  assert.equal(owner.kind, "ok");
  await pg.close();
});

test("the office PIN is refused on the server after an owner has a password", async () => {
  const previous = process.env.OFFICE_PIN;
  process.env.OFFICE_PIN = "pin-for-test";
  const pin = "pin-for-test";
  const req = new Request("http://localhost/api/office-pin", {
    headers: { "x-office-pin": pin, "x-forwarded-for": "203.0.113.40" },
  });
  try {
    setPinFallbackCheck(async () => false);
    await assert.rejects(
      () => assertOfficePin(req),
      (err: unknown) => err instanceof OfficeAuthError && err.status === 403
    );
    assert.equal(await isOfficeRequest(req), false);
    setPinFallbackCheck(async () => true);
    await assertOfficePin(req);
    assert.equal(await isOfficeRequest(req), true);
  } finally {
    resetPinFallbackCheck();
    if (previous === undefined) delete process.env.OFFICE_PIN;
    else process.env.OFFICE_PIN = previous;
  }
});

test("an access request tells ashley through the feedback webhook and never calls it when unset", async () => {
  const previous = process.env.SLACK_WEBHOOK_FEEDBACK;
  const calls: string[] = [];
  process.env.SLACK_WEBHOOK_FEEDBACK = "https://hooks.example.test/feedback";
  try {
    const sent = await postAccessRequestToSlack(
      { name: "Sam Rivera", email: "sam.rivera@example.com", phone: "555-010-0199" },
      async (url, init) => {
        calls.push(`${url}\n${String(init.body)}`);
        return new Response("ok", { status: 200 });
      }
    );
    assert.equal(sent, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /https:\/\/hooks\.example\.test\/feedback/);
    assert.match(calls[0], /@ashley/);
    assert.doesNotMatch(calls[0], /long-enough-password/);
    const body = JSON.parse(calls[0].split("\n").slice(1).join("\n")) as { channel?: string };
    assert.equal(body.channel, undefined);

    delete process.env.SLACK_WEBHOOK_FEEDBACK;
    let called = false;
    const skipped = await postAccessRequestToSlack(
      { name: "Sam Rivera", email: "sam.rivera@example.com", phone: "555-010-0199" },
      async () => {
        called = true;
        return new Response("ok");
      }
    );
    assert.equal(skipped, false);
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.SLACK_WEBHOOK_FEEDBACK;
    else process.env.SLACK_WEBHOOK_FEEDBACK = previous;
  }
});

test("setting a password without the helper still closes the fallback flag", async () => {
  const pg = new PGlite();
  await seed(pg);
  const db = runner(pg);
  assert.equal(await anyOwnerHasPassword(db, ORG), false);
  await setUserPassword(db, ORG, "user-ashley", await hashPassword("owner-long-password"));
  assert.equal(await anyOwnerHasPassword(db, ORG), true);
  await pg.close();
});
