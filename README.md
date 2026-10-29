# Insurance Policy & Claims Management

A web application in which an **administrator** creates insurance policies and decides claims, and **customers** view their own policies, submit claims and track them. The claim accounting rules are enforced on the server, both in the application and in the database.

| | |
|---|---|
| **Live application** | **https://tailvar-policy-claims.vercel.app** |
| Health check | https://tailvar-policy-claims.vercel.app/api/health |

| Role | Username | Password |
|---|---|---|
| Customer 1 | `customer1` | `Customer1@Demo26` |
| Customer 2 | `customer2` | `Customer2@Demo26` |
| Administrator | `admin` | `Admin@Demo26` |

> The production database was reset after the automated test runs, so reviewers start with the three demo accounts and no policies or claims.

---

## 1. Project overview and implemented features

**Authentication and access control**
- Login page; every page and API endpoint requires a session. Logout revokes the session on the server.
- Role-based authorisation runs on the server for every request. Customers can only reach their own policies and claims. A request for another customer's record by ID returns `404`, so the response doesn't reveal that the record exists. The administrator can see everything.
- Sessions are random 256-bit tokens in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Only a SHA-256 hash of the token is stored, and sessions expire after 8 hours.
- Passwords are stored as bcrypt hashes. Brute-force protection allows 10 failures per username and IP in 15 minutes. Login gives the same message whether the username or the password is wrong, and spends the same time either way, so usernames can't be discovered.
- CSRF defences: same-origin `Origin` check, mandatory `application/json` bodies, and `SameSite` cookies.

**Administrator**
- Create a policy for either customer with coverage start date, end date and sum insured (SI).
- View all policies with customer, coverage dates, SI, pending (blocked) amount, approved amount and **remaining claimable SI**.
- View all claims with customer, linked policy, incident date, amount, live status and decision details. Claims can be filtered by status, with counts.
- Approve or reject claims in *Submitted* status. The response immediately returns the updated claim and the policy's new remaining SI.

**Customer**
- View own policies: coverage dates, original SI, pending, approved and remaining claimable SI.
- Submit a claim against one of their own policies (incident date and amount). The form shows the coverage window and the remaining SI.
- View own claims with current status (*Submitted*, *Approved*, *Rejected*) and decision time. Data reloads when the tab regains focus and via a Refresh button.

**Interface**
- **Sum-insured meter** on every policy: approved (solid), pending (hatched) and still-claimable cover, with amounts in lakh/crore.
- **Decision preview:** before approving or rejecting, the admin sees the claim summary and how the policy's claimable cover will change (e.g. ~~₹4,00,000~~ → ₹10,00,000 on reject).
- **Live claim checks:** the claim form shows how much will remain after the claim, or how far it exceeds the limit, and limits the date picker to the coverage period. The server still validates everything.
- Policy issue form with 1/2/3-year term shortcuts, days-of-cover count, sum-insured presets (₹5 L … ₹1 Cr) and the amount in words ("₹ 10 lakh").
- Admin summary tiles (claims awaiting decision, policies, approved, claimable cover), a claims queue with status filters and search, and policies filtered by customer.
- One-click demo account buttons on the login page, toasts for results, skeleton loading states and empty states.
- Light and dark themes (follows the OS, with a toggle). Responsive down to phone width, where tables turn into labelled cards. Keyboard-accessible dialogs built on native `<dialog>`, with visible focus and reduced-motion support.

**Claim accounting rules (all enforced server-side)**
- The incident date must fall within policy start to end, **inclusive**.
- The claim amount must be > 0 and ≤ the remaining claimable SI.
- Submitted + Approved claims can never exceed SI. *Submitted* claims block SI immediately, *Approved* claims keep consuming it, and *Rejected* claims release it.
- Only *Submitted* claims can be decided, and a decided claim can never be decided again.
- Invalid policy dates (end before start), non-positive SI or amounts, unauthorised access and invalid decisions are all rejected with clear error messages.

### Requirements coverage

Each requirement in the brief, where it is implemented, and the automated check that proves it (`S` = service/DB integration test, `A` = HTTP API test against production, `U` = browser test against production).

| Brief | Requirement | Implementation | Verified by |
|---|---|---|---|
| 1.2 | Login interface; 3 working demo accounts | `/login`, users seeded by `db:migrate` | A "demo accounts log in", U |
| 1.2 | Authentication required for all data; logout | Session check in every route and page; `POST /api/auth/logout` deletes the session | A "unauthenticated API access… 401", "logout revokes the session" |
| 1.2 | Customers see only their own data; admin sees all | Ownership filters in `service.ts`; others' records → `404` | S "data isolation", A "data isolation", U (customer2 can't see the policy) |
| 1.3 | Policy: unique ID, owner, start/end date, SI | `policies` table (`DATE`, `NUMERIC(14,2)`, `CHECK`s) | S "policy creation" |
| 1.3 | Claim: unique ID, policy, incident date, amount, status | `claims` table, status `CHECK` | S, A |
| 1.3 | Calendar dates; positive amounts with monetary precision | `DATE` columns returned as `YYYY-MM-DD` strings; `NUMERIC(14,2) > 0`; integer paise in code | S "handles paise precisely", unit tests |
| 1.3 | Data persists across sessions and restarts | PostgreSQL on Neon (durable storage); nothing held in memory. The seeded users and test data survived several redeployments | — |
| 1.4 | Admin creates a policy for either customer | `POST /api/policies` (admin only) | A, U |
| 1.4 | Admin views all policies with remaining claimable SI | `GET /api/policies` + `policy_summary` view | A, U |
| 1.4 | Admin views all claims (customer, policy, incident date, amount, live status) | `GET /api/claims` + `claim_details` view | A "customer sees updated statuses…" |
| 1.4 | Approve/reject Submitted claims; status and SI update immediately | `POST /api/claims/:id/decision` returns updated claim + policy | S, A, U |
| 1.5 | Customer views own policies (dates, original SI, remaining SI) | Policy cards | U |
| 1.5 | Customer submits a claim against own policy | `POST /api/claims` (customer only) | A, U |
| 1.5 | Customer views own claims with current status, updated on refresh | `GET /api/claims`; reloads on refresh/focus | A, U |
| 1.6 | Incident date within policy dates, inclusive | App check + DB trigger | S "inclusive", "one day outside"; A |
| 1.6 | Amount > 0 and ≤ remaining SI | `parseAmount` + locked SI check + trigger | S, A |
| 1.6 | Submitted + Approved ≤ SI at all times, incl. concurrency | Policy row lock + trigger | S "parallel submissions", A "concurrent submissions" |
| 1.6 | Submitted blocks, Approved consumes, Rejected releases | Remaining = SI − Σ(Submitted + Approved) | S, A, U (illustrative example, both branches) |
| 1.6 | Only Submitted can be decided; no re-decision | Conditional `UPDATE` + trigger | S "cannot decide an already-decided claim", A (`409`) |
| 1.6 | Reject bad dates, non-positive SI/amounts, unauthorised access, invalid decisions; server-side | Service layer + DB constraints | S, A |
| 1.7 | Browser UIs for both roles | `/admin`, `/customer` | U |
| 1.7 | Free-tier hosting, live until 30 Nov 2026, durable store | Vercel Hobby + Neon free | §4 |

---

## 2. Technology stack and rationale

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One typed language across UI, API and tests. |
| Web framework | **Next.js 16** (App Router) + **React 19** | One deployable unit serves both the UI and the REST API (route handlers). UI and API share one origin, so there is no CORS and the session cookie stays first-party. Pages get server-side auth guards. |
| UI | Hand-written CSS design tokens (light + dark), **Bricolage Grotesque** (headings, figures), **Figtree** (body), **IBM Plex Mono** (policy/claim references) via `next/font` (self-hosted, no layout shift), **lucide-react** icons | No CSS framework needed for a small app. The tokens keep both themes consistent, and the fonts give a clear hierarchy for money-heavy screens. |
| Database | **PostgreSQL** (Neon serverless Postgres 18) | Relational integrity, `NUMERIC` money, real `DATE` type, `CHECK` constraints, row-level locking and triggers. These are exactly what the SI invariants need. |
| DB access | **node-postgres (`pg`)**, hand-written SQL | Locking (`SELECT … FOR UPDATE`), conditional updates and aggregates stay explicit and easy to review. No ORM magic around the concurrency-critical paths. |
| Auth | Custom DB-backed sessions + **bcryptjs** | Small surface area, and logout can be revoked server-side (unlike stateless JWTs). |
| Hosting | **Vercel** (Hobby/free) | Zero-ops, free HTTPS, global edge network, serverless functions pinned to Singapore next to the DB. |
| Tests | **Vitest** (unit + DB integration), Node `fetch` black-box API suite, **Playwright** browser test | Covers business logic, the HTTP contract and the actual UI workflows. |

---

## 3. System architecture (components, data flow, database, hosting and where each component is deployed)

```
   Browser (React UI)
        │  HTTPS (session cookie)
        ▼
 ┌──────────────────────────┐
 │ Vercel Edge Network      │  TLS termination, routing, security headers
 │ (nearest PoP, e.g. bom1) │
 └────────────┬─────────────┘
              ▼
 ┌────────────────────────────────────────────────────────────┐
 │ Vercel Serverless Function — region sin1 (Singapore)       │
 │ Next.js app                                                │
 │  ├─ Pages: /login, /admin, /customer  (server-side guard)  │
 │  ├─ REST API: /api/*  (route handlers)                     │
 │  │     └─ http.ts: JSON parsing, CSRF check, error mapping │
 │  ├─ service.ts: authorisation + business rules             │
 │  └─ auth.ts: login, sessions, rate limiting                │
 └────────────┬───────────────────────────────────────────────┘
              │  TLS (verify-full), pg connection pool
              ▼
 ┌────────────────────────────────────────────────────────────┐
 │ Neon Postgres 18 — AWS ap-southeast-1 (Singapore)          │
 │  PgBouncer pooler → tables, CHECK constraints,             │
 │  enforce_claim_rules trigger, policy_summary/claim_details │
 │  views                                                     │
 └────────────────────────────────────────────────────────────┘
```

| Component | Where it runs |
|---|---|
| Frontend (React, server-rendered shell + client components) | Vercel (static assets on the edge CDN, pages rendered in the `sin1` function) |
| Backend REST API (Next.js route handlers) | Vercel Serverless Functions, `sin1` Singapore (closest Vercel region with Neon nearby; ~India latency) |
| Database | Neon free tier, AWS `ap-southeast-1` Singapore, accessed through Neon's connection pooler |

### Data flow (claim submission)
1. The browser `POST`s `/api/claims` with JSON `{policyId, incidentDate, amount}` and the session cookie.
2. The route checks the `Origin` and resolves the session to a user. Anything other than a **customer** gets `401`/`403`.
3. `submitClaim` validates the input formats, then opens a transaction and **locks the policy row** (`SELECT … FOR UPDATE`). This serialises concurrent submissions against that policy.
4. Inside the lock it checks ownership (otherwise `404`), the coverage window (`422`) and remaining SI = SI − Σ(Submitted + Approved) (`422`). It then inserts the claim.
5. The `enforce_claim_rules` **trigger** re-checks the same invariants inside the database before the insert is written. This is a second layer that also covers any future code path or a manual SQL write.
6. Remaining SI is computed by the `policy_summary` view on every read, so no stored counter can drift.

A **decision** is a single conditional `UPDATE … WHERE id = $1 AND status = 'Submitted'`. If two administrators decide simultaneously, exactly one wins and the other gets `409`.

### Data model
| Table | Key columns |
|---|---|
| `users` | `id`, `username` (unique), `password_hash` (bcrypt), `role` ∈ {customer, admin}, `display_name` |
| `policies` | `id` (shown as `POL-000001`), `customer_id → users`, `start_date DATE`, `end_date DATE`, `sum_insured NUMERIC(14,2) > 0`, `CHECK (end_date >= start_date)`, `created_by` |
| `claims` | `id` (shown as `CLM-000001`), `policy_id → policies`, `incident_date DATE`, `amount NUMERIC(14,2) > 0`, `status` ∈ {Submitted, Approved, Rejected}, `submitted_by`, `decided_by`, `decided_at` |
| `sessions` | `token_hash` (SHA-256), `user_id`, `expires_at` |
| `login_failures` | `username`, `ip`, `attempted_at` (rate limiting) |

**Persistence:** all policies, claims, users and sessions are stored in PostgreSQL (Neon, durable disk-backed storage). The application servers are stateless, so data survives sessions, function restarts and redeployments.

The schema lives in [`db/schema.sql`](db/schema.sql). It is idempotent and applied by `npm run db:migrate`, which also seeds the demo users.

### REST API
All endpoints return JSON. Errors have the shape `{ "error": { "code", "message" } }`.

| Method & path | Role | Description |
|---|---|---|
| `POST /api/auth/login` | public | `{username, password}` → sets session cookie |
| `POST /api/auth/logout` | any | Revokes session, clears cookie |
| `GET /api/me` | any | Current user |
| `GET /api/customers` | admin | Customers for the policy form |
| `GET /api/policies` | admin: all · customer: own | Policies with pending/approved/remaining SI |
| `POST /api/policies` | admin | `{customerId, startDate, endDate, sumInsured}` |
| `GET /api/policies/:id` | owner or admin | Policy + its claims |
| `GET /api/claims[?status=&policyId=]` | admin: all · customer: own | Claims |
| `POST /api/claims` | customer | `{policyId, incidentDate, amount}` |
| `GET /api/claims/:id` | owner or admin | Single claim |
| `POST /api/claims/:id/decision` | admin | `{decision: "approve" \| "reject"}` → updated claim + policy |
| `GET /api/health` | public | DB connectivity check |

Status codes: `400` invalid input · `401` not logged in · `403` wrong role / cross-origin · `404` not found or not yours · `409` already decided · `415` non-JSON body · `422` business rule violated (outside coverage, exceeds remaining SI) · `429` too many login attempts.

### Running locally
Prerequisites: Node 22.18+ or 24 (runs the `.mts` scripts natively), PostgreSQL 14+.
```bash
npm install
createdb tailvar && createdb tailvar_test
cp .env.example .env.local            # DATABASE_URL=postgres://localhost:5432/tailvar
DATABASE_URL=postgres://localhost:5432/tailvar npm run db:migrate
npm run dev                           # http://localhost:3000
```

### Deploying
1. Create a Postgres database (Neon free tier was used) and run `npm run db:migrate` with `DATABASE_URL_UNPOOLED` (direct) or `DATABASE_URL` set.
2. Create a Vercel project and add `DATABASE_URL` (the **pooled** connection string) as a production environment variable.
3. `vercel deploy --prod`. The function region is pinned to `sin1` in [`vercel.json`](vercel.json).

---

## 4. Live application URL

**https://tailvar-policy-claims.vercel.app**

Hosted on Vercel's free Hobby plan, with the database on Neon's free plan. Neither plan expires, so the app will stay live beyond 30 November 2026. After about 5 minutes of inactivity Neon suspends compute, so the first request after an idle period may take about 1 second longer.

---

## 5. Tests performed

| Suite | Command | What it covers | Result |
|---|---|---|---|
| Unit | `npm test` | Money parsing (paise/BigInt, precision, bounds), calendar-date validation (Feb 30, leap years, formats), ID validation | ✅ |
| DB integration (real Postgres) | `npm test` | 38 tests in total with the unit tests. Auth, lockout, session expiry and revocation; policy validation; data isolation; inclusive date boundaries; SI accounting incl. the brief's illustrative example (both branches); exact-SI and +₹0.01 boundaries; paise precision; double-decision; re-approving a rejected claim; **8 parallel submissions** never over-commit SI; **3 parallel decisions** → exactly one wins; DB trigger and constraints block direct SQL writes that break the rules | ✅ 38/38 |
| Black-box API | `BASE_URL=… npm run test:api` | 21 scenarios over HTTP: 401 on all endpoints unauthenticated, redirects for pages, identical errors for bad user and bad password, cookie flags (`HttpOnly`, `SameSite`, `Secure` on HTTPS), role enforcement both ways, CSRF (foreign `Origin` → 403, form-encoded → 415), policy and claim validation, IDOR attempts (`404`), full illustrative flow, 5 concurrent HTTP claims, forged cookie, session revoked after logout | ✅ 21/21 locally **and against production** |
| Browser (Playwright, Chromium) | `BASE_URL=… npm run test:ui` | Bad login message, demo-account fill → admin issues policy (`10,00,000` input, "365 days of cover", "₹ 10 lakh" hint) → customer2 can't see it → customer1 claims ₹6L from the policy card → ₹5L blocked in the form ("more than the ₹4,00,000.00 still claimable") → admin rejects, with the preview showing ₹10,00,000.00 → customer sees *Rejected* and claims ₹5L → logout and route guard | ✅ locally **and against production** |
| Visual | screenshot script | Desktop and 390 px phone in light and dark themes: no horizontal page scroll, tables collapse into labelled cards, dialogs fit the screen. Security headers (`X-Frame-Options`, `nosniff`, HSTS, `Referrer-Policy`) checked | ✅ |

Integration tests use a separate `tailvar_test` database (`TEST_DATABASE_URL`), which they truncate between tests. The API and UI suites create real data in the target environment, so production was reset with `npm run db:reset-data -- --yes` afterwards.

---

## 6. Edge cases identified, their handling, and fixes made

| Edge case | Handling |
|---|---|
| Incident date exactly on start or end date | Accepted (inclusive). Tested. |
| Incident date one day before start / after end | `422 INCIDENT_OUTSIDE_COVERAGE`. Tested. |
| End date equal to start date (one-day policy) | Allowed; only *end before start* is rejected (`400`). Also enforced by `CHECK` constraint. |
| Impossible dates (`2026-02-30`, `2027-02-29`), wrong formats, timestamps | `400`. Dates are validated as real calendar dates in `YYYY-MM-DD`. |
| Claim equal to remaining SI / ₹0.01 more | Equal is accepted; anything above is `422 SUM_INSURED_EXCEEDED` with the remaining amount in the message. |
| Zero, negative, non-numeric, >2 decimals, exponent notation (`1e5`), beyond `NUMERIC(14,2)` | `400`. Amounts are never rounded silently. |
| Floating-point money errors (0.1 + 0.2) | Money is kept as decimal strings in JSON, `NUMERIC(14,2)` in Postgres and integer paise (`BigInt`) for comparisons. It never passes through JS floats. Tested. |
| Two claims submitted at the same moment that together exceed SI | The policy row lock serialises them, so only those that fit succeed. Verified with 8 parallel calls (service) and 5 parallel HTTP calls (production). |
| Two admins deciding the same claim at once | A conditional `UPDATE … WHERE status='Submitted'` lets exactly one win; the others get `409`. Tested. |
| Re-deciding a decided claim (incl. re-approving a rejected one, which would re-consume released SI) | `409 CLAIM_ALREADY_DECIDED`, also enforced by the DB trigger. |
| Customer requests another customer's policy or claim by ID, or claims against it | `404` (no existence leak). Tested at service and HTTP level. |
| Customer calls admin endpoints; admin submits a claim | `403`. The role is checked before the body is even parsed. |
| Policy for a non-existent user or for the admin account | `400`; the `INSERT … SELECT` only matches users with role `customer`. |
| Direct SQL writes bypassing the app (future code, manual fixes) | The `enforce_claim_rules` trigger and `CHECK` constraints enforce coverage, SI, immutability of claim details and one-way status transitions. Tested. |
| `DATE` columns shifting by a day due to timezones | The `pg` type parser returns `DATE` as a plain `'YYYY-MM-DD'` string, and the UI formats it without `new Date()`. Server timezone is irrelevant. |
| Session expired or logged out in another tab | The API returns `401` and the client redirects to `/login`. Server pages redirect unauthenticated users. |
| Stolen cookie after logout / forged cookie | Sessions are server-side and deleted on logout, so both return `401`. Tested. |
| Brute-force and username enumeration | Lockout after 10 failures per username and IP in 15 min (`429`), identical error message, dummy bcrypt compare for unknown users. |
| CSRF from another site | `Origin` mismatch → `403`, non-JSON → `415`, `SameSite=Lax` cookie. Tested. |
| Users typing `10,00,000` or `₹5,000` | The UI strips grouping characters before sending; the API accepts only plain decimals. |

**Fixes made during development**
- **Auth before validation:** mutation routes originally parsed and validated the JSON body before checking the role, so unauthenticated callers could get `400`/`415` instead of `401`. They now check the role first (the service layer still re-checks as defence in depth).
- **Stale banners:** a previous success banner stayed visible next to a new validation error, which was confusing. Banners are now cleared on each new submission (customer claim form and admin policy form).
- **Reject preview figures:** in the redesigned decision dialog, the meter legend first showed the pre-decision pending amount. It now shows the values that will apply after the decision.
- **Hidden filter:** the customer filter (shown only on the Policies tab) was also silently filtering the Claims tab. It now applies to policies only.
- **Error message currency:** the "exceeds remaining SI" message lacked the ₹ symbol; it is now formatted in Indian grouping (`₹4,00,000.00`).
- **Dependency vulnerability:** `npm audit` reported a high-severity issue in `zod`, pulled in transitively by `@vercel/functions`. It is fixed with an npm `overrides` pin (0 vulnerabilities).
- **TLS mode:** connection strings use `sslmode=verify-full`, which makes certificate verification explicit and removes `pg`'s deprecation warning for `sslmode=require`.

---

## 7. Assumptions, design trade-offs, known limitations and outstanding issues

**Assumptions**
- Currency is INR, displayed with Indian digit grouping. Amounts are limited to ₹999,999,999,999.99 (`NUMERIC(14,2)`).
- The only constraint on a claim's date is the one in the brief: the incident must fall inside the coverage period. Claims can therefore be filed after the policy has ended, and incident dates in the future are accepted if they are inside coverage. A real product would likely add a notification window and reject future incident dates. I left this out so the rules match the brief exactly.
- A one-day policy (start = end) is valid.
- Decisions are all-or-nothing (no partial approval). Customers cannot edit or withdraw claims, and administrators cannot submit claims on a customer's behalf.
- Policies cannot be edited or deleted. Changing SI or dates after claims exist would need extra rules (e.g. SI can't drop below committed claims), and the brief doesn't require it.
- User management is out of scope; the three demo accounts are seeded by the migration.

**Design trade-offs**
- **Single Next.js deployable (UI + API)** rather than separate frontend and backend services: simpler deployment and same-origin cookies. The business logic still lives in a framework-independent service layer (`src/lib/service.ts`) that is tested directly.
- **Remaining SI is computed on read** (aggregate view) instead of stored as a counter: it can't drift, and the cost is trivial at this scale. At high volume I'd keep a counter on `policies`, updated under the same row lock.
- **App-level checks + DB trigger** means the rules are written twice, deliberately. The app gives friendly, specific errors; the trigger guarantees integrity for any writer.
- **DB sessions vs JWT:** one indexed lookup per request in exchange for real logout and revocation.
- **Explicit migration step** (`npm run db:migrate`) instead of migrating during the Vercel build, so preview builds can never alter the production schema.
- **Rate limiting in Postgres** rather than Redis: no extra infrastructure, good enough for this load.

**Known limitations and outstanding issues**
- The demo accounts are shared by all reviewers, so data one reviewer creates is visible to the others using the same account.
- The login page lists the demo accounts as one-click fill-ins to make reviewing easier. A real deployment would remove them.
- No pagination or search on lists (fine for demo volumes).
- No real-time push. Data refreshes on tab focus, on the Refresh button and after each action, as the brief allows.
- Audit trail is limited to `created_by`, `submitted_by`, `decided_by` and `decided_at`. There is no full event history.
- No password change or reset, and no MFA (out of scope for fixed demo accounts).
- IP-based rate limiting can be evaded by distributed attackers. A production system would add an account-level progressive delay or CAPTCHA.
- No CI pipeline is configured. The test suites are run manually (commands above).
- Neon's free-tier compute sleeps after inactivity, so there is a ~1 s cold start on the first request.

---

## 8. AI tools used, how they were used, and location of AI conversation logs

- **Tool:** Claude Code (Anthropic) in the VS Code extension, model **Claude Opus 5.5**.
- **How it was used:** the assignment brief was given to Claude Code, which planned the architecture, wrote the application code, SQL schema, tests and this README, ran the test suites, and drove the deployment through the Vercel and Neon CLIs. The developer made the account and hosting decisions: the deployment was moved to a personal Vercel and Neon account dedicated to this project, with CLI credentials kept in a project-local, git-ignored folder. The developer also completed the browser-based logins. In a follow-up prompt the developer asked for a better UI/UX. Claude Code then redesigned the frontend (typography, light/dark tokens, sum-insured meter, dialogs, responsive layout), checked screenshots in both themes and at phone width, and updated the browser test. A final prompt asked for an audit against the brief, which added the requirements coverage table above. Every behaviour described above is backed by the automated suites, which were run locally and against production.
- **Conversation log:** [`ai-logs/claude-code-session.md`](ai-logs/claude-code-session.md) is an export of the session with secrets and unrelated personal or organisation details redacted. It was generated by [`ai-logs/export-transcript.mts`](ai-logs/export-transcript.mts).

---

## Repository layout

```
db/schema.sql                 Tables, constraints, trigger, read views (idempotent)
scripts/migrate.mts           Applies schema + seeds demo users
scripts/reset-data.mts        Clears policies/claims/sessions (keeps users)
scripts/package-submission.mts Exports AI log, builds the submission ZIP (npm run package)
src/lib/                      service (business rules), auth, db, http, validation, money
src/app/api/                  REST route handlers
src/app/{login,admin,customer}  Pages, dashboards and dialogs
src/components/ui/            Design-system components (SI meter, dialog, toasts, badges, stats)
tests/                        Vitest unit + integration, e2e/api.e2e.mts, ui/workflow.spec.ts
ai-logs/                      AI conversation log + exporter
```
