import assert from "node:assert/strict";
import test from "node:test";
import {
  accountMailConfigured,
  approvedEmailText,
  sendAccountMail,
  setupEmailText,
} from "./server/account-mail.ts";
import { setupLinkHandoff } from "./setup-link-copy.ts";

test("setup mail is off until both Resend settings exist", () => {
  assert.equal(accountMailConfigured({}), false);
  assert.equal(accountMailConfigured({ RESEND_API_KEY: "re_test" }), false);
  assert.equal(
    accountMailConfigured({ RESEND_API_KEY: "re_test", RESEND_FROM: "Inspekt <hi@example.com>" }),
    true
  );
});

test("a missing key does not send and the wording says so", async () => {
  let called = false;
  const result = await sendAccountMail(
    { to: "ada@example.com", subject: "Setup", text: "link" },
    {},
    async () => {
      called = true;
      return new Response("no", { status: 500 });
    }
  );
  assert.equal(result.emailed, false);
  assert.equal(called, false);
  assert.match(setupLinkHandoff(false), /not emailed/);
  assert.match(setupLinkHandoff(true), /^Emailed to them/);
});

test("a successful Resend call is emailed and the body has the one-time link", async () => {
  const bodies: string[] = [];
  const result = await sendAccountMail(
    {
      to: "ada@example.com",
      subject: "Set up Inspekt",
      text: setupEmailText({
        name: "Ada",
        url: "https://fleet.example/setup/token",
        kind: "invite",
      }),
    },
    { RESEND_API_KEY: "re_test", RESEND_FROM: "Inspekt <hi@example.com>" },
    async (_url, init) => {
      bodies.push(String(init?.body));
      return new Response("{}", { status: 200 });
    }
  );
  assert.equal(result.emailed, true);
  assert.match(bodies[0] || "", /https:\/\/fleet\.example\/setup\/token/);
  assert.equal(bodies[0]?.includes("re_test"), false);
  assert.match(approvedEmailText({ name: "Ada", signInUrl: "https://fleet.example/" }), /password you already chose/);
});

test("a Resend error keeps the link for the admin to pass on", async () => {
  const result = await sendAccountMail(
    { to: "ada@example.com", subject: "Setup", text: "link" },
    { RESEND_API_KEY: "re_test", RESEND_FROM: "Inspekt <hi@example.com>" },
    async () => new Response("no", { status: 403 })
  );
  assert.equal(result.emailed, false);
});
