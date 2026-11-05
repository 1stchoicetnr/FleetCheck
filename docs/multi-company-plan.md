# Plan: any fleet company can use Inspekt

This is a plan only. No app code changes, no merge, and no production deploy.

Inspekt today is one shared workshop. Rad Cab, 1st Choice Recovery, Turo, Pinkie Tow, and Other fleets already live side by side, but they are labels inside **one** business. One Office PIN opens every report. Anyone who can open the site can tap Driver and pick any fleet. A second, unrelated company cannot sign up without seeing this data.

The goal is a real company account. 1st Choice keeps everything it has now, under one company named **1st Choice / Rad Cab**. A new customer gets an empty company and never sees 1st Choice vehicles, photos, or Slack.

## What is true today

**Sign-in is a role button, not a person.** The home screen says “Demo mode — no password required.” Tapping Driver, Office, Tech, or Super Admin stores that choice in the phone (`fleetcheck-session`). The server does not check it. Ashley, James, Office, Tech, and Driver exist as sample people (`ashley@fleetcheck.local` and the other `@fleetcheck.local` addresses). Those rows have no password and no company.

**Office is one shared PIN.** The PIN is `1357` unless `OFFICE_PIN` is set. A correct PIN sets a 12-hour cookie. That cookie opens every company, every report, user edits, alerts, and the “drivers may add vehicles” switch. Five wrong tries from one address lock that address for 15 minutes.

**“Company” already means a fleet label, not a customer.** The database table `companies` holds Rad Cab, 1st Choice Recovery, Turo, Pinkie Tow, and Other fleets. Vehicles and checkout reports point at one of those labels. That split must stay. Turo units must not become Rad Cab units.

**These tables have no company stamp at all:**

- Alerts (`fleet_alerts`)
- The one settings row (`fleet_settings`, id `app`) — today only “may drivers add a vehicle?”
- People (`app_users`)
- App feedback (`app_feedback`)

**Photos are public files.** A checkout photo is stored as `checkout/<report id>/<angle>.jpg` (Blob adds a random suffix). Feedback screenshots are `feedback/<id>/...`. The link is public. The path does not name a company. Old links must keep working.

**Slack and email are 1st Choice’s, for the whole app.**

- Rad Cab damage goes to `#rad-cab-repairs`. Everything else goes to `#equipment-issues`. Channel ids are written in the app. Webhooks are server settings (`SLACK_WEBHOOK_RAD_CAB_REPAIRS`, `SLACK_WEBHOOK_EQUIPMENT_ISSUES`, and the older checkout copy webhook).
- The Feedback button DMs Ashley (`SLACK_WEBHOOK_FEEDBACK`). If Slack is off, email can go to `ashley@warecovery.com`.
- Clover (the borrowed card reader) is shown only for Rad Cab.
- PDFs use the Inspekt name and navy header. The fleet name can be printed, but there is no per-customer logo.
- The driver still types a dispatcher name. Seeded sample reports use Ashley or James. That field is not a locked account.

**A stranger can already read too much.** The company list is public. Asking for one fleet’s vehicles does not need the Office PIN. Creating a checkout and uploading photos for about six hours after it is created does not need a signed-in driver. Office lists do need the PIN, and leaving the fleet blank on the vehicle list also needs the PIN. That is not enough once a second customer exists.

## 1. Data model

Add a customer record, called a **company** in the product. Keep today’s fleet labels as **fleets** inside that company. Do not rename the existing `company_id` column in the first step. It already means “Rad Cab vs Turo vs Pinkie,” and changing it in one move is how data gets lost.

New table, `orgs` (shown as Company):

- id, name, slug
- owner email
- created time
- settings (see section 4), stored on this row so a new company cannot inherit 1st Choice’s Slack or PIN

One new column, `org_id`, on every table that holds customer data:

- fleets (today’s `companies` rows)
- vehicles
- checkout reports
- alerts
- people
- feedback
- settings (stop using the single global row for new companies)
- future invites

**Migration, with nothing deleted and no fleet label changed:**

1. Create `orgs` if it is missing.
2. Insert one row: name **1st Choice / Rad Cab**, slug `1st-choice-rad-cab`. If that row is already there, leave it.
3. Add `org_id` as optional.
4. Set `org_id` on every existing fleet, vehicle, report, alert, user, feedback row, and the current settings row to that one company. Do this only where `org_id` is still empty.
5. After a count check (rows with an empty `org_id` must be zero), make `org_id` required.
6. Do not update `company_id`, plates, photos, review status, or Slack history.

Seeded demo vehicles stay inside this company, still under their current fleet. New sign-ups do not receive those seeds.

Indexes: `(org_id, completed_at)` on reports and `(org_id, plate)` on vehicles, so Office lists stay fast.

## 2. Isolation

Every read and write goes through **one helper**. The helper refuses to run unless it was given a company id, and every statement includes `org_id = that company`. Routes stop accepting a fleet id from the browser as proof of access. The signed-in person supplies the company. A fleet id is checked to be one of that company’s fleets.

Same rule for files. New photos and feedback images are stored as `orgs/<company id>/checkout/...` and `orgs/<company id>/feedback/...`. Existing public links are left where they are so old reports still open. A request for another company’s new path returns “not found,” not the other file.

Postgres row-level security is the backstop, not the first lock. The database client used now sends each statement on its own. A “set the company, then query” pair can land on two different connections, so the database would not remember the company. The helper is reliable immediately. A later step can wrap each request in one transaction, set the company inside that transaction, and turn on row-level policies. Tests must fail if a policy is missing.

Tests, using two fake companies and no production data:

- Company A’s Office list never includes B’s reports, vehicles, alerts, or feedback.
- Opening B’s report id, vehicle id, or photo path while signed in as A returns not found.
- A driver in A cannot list B’s fleets or add a vehicle into B.
- A checkout posted with B’s fleet id while the session is A is rejected.
- Counts after the migration match the counts before it, and every old fleet id is unchanged.

## 3. Sign-in and roles

Replace the role buttons and the shared PIN with a real person.

**Email and password first.** Magic links need outbound email, which is optional today. Passwords work with the database we already have. A “email me a sign-in link” option can follow once email sending is reliable.

Each person has a membership, not a single global role:

- **Driver** — start a checkout for this company’s vehicles, take photos, sign.
- **Office** — review reports, archive units, known issues and oil, feedback. This replaces PIN `1357`.
- **Owner** — everything Office can do, plus company settings, invites, and who is active.

Tech becomes Office on the 1st Choice company. Super Admin becomes Owner of that company only. There is no role that can browse every customer. If Inspekt staff need a support door later, that is a separate staff flag, not a button on the customer login screen.

**Carry-over for the people who exist now:**

| Today | After |
| --- | --- |
| Ashley, James | Owners of 1st Choice / Rad Cab |
| Office | Office of that company |
| Tech | Office of that company |
| Driver | Driver of that company |

They have no passwords today, so the first release gives each of them a one-time setup link (or a temporary password Ashley hands out) and then the role buttons disappear. Phones signed in the old way are sent to the new sign-in screen. Sample `@fleetcheck.local` addresses stay until that release, then Ashley can attach real emails. Checkout history keeps the driver and dispatcher **names** already stored on each report. Those names are not turned into accounts.

Office phones lose the shared PIN only after at least one Owner can sign in. Until that release, the PIN still works and only for 1st Choice / Rad Cab.

## 4. Sign-up and each company’s own settings

A public page, not the demo role list:

1. Company name, owner name, email, password.
2. That creates an empty company and an Owner. It does not copy Rad Cab, Turo, or any vehicle.
3. Owner adds the first vehicles (unit number, plate, year, make, model, gas or EV).
4. Owner invites drivers. The invite is a link and a QR code. The driver opens it, sets a password, and lands in that company only. An invite expires and can be revoked.

Settings the Owner can change, stored on the company, not in server environment variables:

- Which fleet types they use (taxi, tow, Turo, service).
- Which photos are required. New companies start from the current walkaround. They can turn shots off. 1st Choice keeps the checklist it uses now.
- Whether this fleet asks for a Clover serial. Only Rad Cab starts with this on.
- Slack webhook for damage alerts, and a separate one for app feedback. Blank means “save it in Office, do not post to Slack.”
- Name and logo printed on the PDF, under the Inspekt mark. No logo means the Inspekt header only, which is what PDFs do today.

## 5. Values to move into company settings

Leave these in company settings for **1st Choice / Rad Cab** so today’s behavior does not change. New companies start blank or with the generic checklist.

- Office PIN `1357` and `OFFICE_PIN` — removed after real Office logins work. Not copied into new companies.
- Clover only for the Rad Cab fleet.
- Slack webhooks and the `#rad-cab-repairs` / `#equipment-issues` channel ids.
- Feedback destination: Ashley’s Slack DM and `ashley@warecovery.com`.
- Default fleet on the checkout screen (Rad Cab).
- The taxi → Rad Cab, tow → 1st Choice Recovery mapping. That is seed data, not a rule for new customers.
- Demo role buttons and “no password required.”
- PDF subtitle: company name plus fleet name. Inspekt navy and the Inspekt icon stay the product mark.

Dispatcher stays a name the driver types. It is not forced to Ashley.

Do not rename the GitHub repo, the Vercel project, the npm package, IndexedDB `fleetcheck-db`, or the existing local storage keys in these steps. Do not move or delete Blob files that are already stored.

## 6. Rollout in small releases

Each release is safe to ship on its own. None of them depend on a new company existing yet, until the sign-up release.

**A. This plan.** Doc only. No merge required for the app to keep running.

**B. Stamp existing data with the company.** Add `orgs` and `org_id`, backfill 1st Choice / Rad Cab, prove row counts match. Screens look the same. Risk: a migration that updates the wrong column. Mitigation: only fill empty `org_id`; never write `company_id`. Size: small. One migration file and a count test.

**C. Enforce the helper on every route.** Still one real company, so Office and drivers see the same lists. Risk: one route forgotten, and it either breaks or stays open. Mitigation: the tests in section 2, and a search that fails if a query touches those tables outside the helper. Size: medium. Mostly the API routes and the report, vehicle, alert, and feedback queries.

**D. New file paths.** New uploads only. Old photo links unchanged. Risk: a new report stored without the company prefix. Size: small.

**E. Real sign-in for 1st Choice only.** Role buttons still visible until an Owner has signed in once, then they go away. PIN still works. Risk: locking Ashley out. Mitigation: setup links for the five existing people, and the PIN left in place. Size: medium. Login screen, session cookie, membership table.

**F. Turn off the shared PIN.** Only after E is in production and an Owner has signed in. Risk: an Office phone still expecting `1357`. Mitigation: one release where a wrong PIN tells them to sign in with email. Size: small.

**G. Sign-up, first vehicles, invite link and QR.** Risk: junk sign-ups. Mitigation: rate limit, and no access to existing data. Size: medium.

**H. Per-company Slack, Clover, checklist, and PDF name/logo.** Copy 1st Choice’s current webhooks into its settings in the same release so alerts do not go quiet. Risk: a blank webhook if the copy is skipped. Size: medium.

**I. Database policies as a backstop.** Only after the helper is in place, and only inside a single transaction per request. Risk: policies that block the app if the transaction is forgotten. Size: medium. Do this last.

## What stays the same for 1st Choice day to day

Drivers still pick a fleet, run Precheck, photograph the vehicle, and sign. Office still reviews PASS, Conditional, and FAIL. Rad Cab still asks for Clover. Turo, Pinkie, and 1st Choice Recovery stay separate fleets. Old photos and PDFs still open. Damage notes, oil, and known issues stay on the same vehicles.
