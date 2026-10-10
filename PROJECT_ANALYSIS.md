# Project Analysis — Garment QMS Complaints System

> Snapshot: 2026-09-30 · branch `main` @ `1fb056d` · working tree has one
> unstaged change (`server/middleware/upload.js`, trailing-newline only)
> NOTE: Database layer was migrated to MongoDB with Mongoose per user requirements. All Supabase dependencies and configs have been removed.

---

## 1. What it is

Single-repo Quality Management System for a textile/garment factory. Tracks
Non-Conformance (NC) defects from floor capture through closed-loop CAP
verification, with executive oversight dashboards.

Migrated to MongoDB with Mongoose (with resilient in-memory fallback for offline testability).

| Package | Stack | Size |
|---|---|---|
| `client/` | React 18, Vite 5, Tailwind 3, Axios, lucide-react | ~9.4k LOC, 20 components |
| `server/` | Express 4, MongoDB (Mongoose), JWT, Multer, bcryptjs | ~6.2k LOC, 3 controllers |
| `api/` | Vercel serverless entrypoint | 4 lines |

Total source: **~17.1k LOC** (excludes `node_modules`, `client/dist`, uploads).

### Domain model

NC lifecycle — deliberately split into two independent axes:

```
Workflow status : Draft → Open → CAP Submitted → Under Review
                        → Rejected/Rework → Verified → Closed
Deadline cond.  : Open | Due Soon (<4h) | Overdue | Closed
```

The decoupling was commit `fb50c8f` and is correct — SLA state and workflow
state genuinely differ and conflating them makes filters lie.

Every NC carries a 9-field CAP block: immediate correction, root cause,
corrective action, preventive action, responsible person, target date,
evidence, verification method, verification criteria.

### The good part

`server/utils/scoringEngine.js` (199 lines, zero deps) — weighted compliance
scoring. Severity weights Critical=10 / Major=5 / Minor=2 / Observation=1;
status scores COMPLIANT=100, OBSERVATION=50, NON_COMPLIANT=0, with
NOT_APPLICABLE and PENDING excluded from the denominator. Risk band derived
from critical-NC presence, compliance %, and overdue-CAP count.

Self-contained, documented, no coupling. Protect this file.

---

## 2. Blockers, ranked by severity

### 2.1 Auth bypass — `mock-token-` branch (CRITICAL, live)

`server/middleware/auth.js:16-25`

Any request bearing `Authorization: Bearer mock-token-<ROLE>` is granted that
role with **no signature verification**.

```bash
curl -H "Authorization: Bearer mock-token-ADMIN" \
  http://localhost:5000/api/complaints/admin/oversight
```

Returns full admin data. This is live on localhost right now and would ship
public on Vercel. Fix: delete the branch (2 lines).

### 2.2 Supabase wide open to the browser (CRITICAL)

`server/supabase_schema.sql:181-199` — RLS enabled but policies are:

```sql
CREATE POLICY "Allow all for users" ON public.users
  FOR ALL TO public USING (true) WITH CHECK (true);
```

Same for `complaints`. Combined with the hardcoded project URL + publishable
key in `client/src/services/supabase.js`, anyone can open devtools and select
every row — including bcrypt password hashes on `users`.

The anon key is not the weak part; the policies are.

### 2.3 Master password backdoor (HIGH)

`server/controllers/authController.js:103-105` — if bcrypt comparison fails
for user `ALL-001`, login succeeds against any of five hardcoded demo
passwords. Combined with 2.1, both should go.

### 2.4 Photos stored as base64 blobs in TEXT columns (HIGH — structural)

Schema: `beforePhoto TEXT NOT NULL`, `afterPhoto TEXT`.

`ensureDataUrl()` (`complaintController.js:77-106`) inlines every image as a
`data:image/...;base64,...` URL on **read**. An 800×600 JPEG ≈ 200KB → ~270KB
of base64, two per ticket. A 500-ticket deployment is ~270MB of JSON on every
list request, with `safePersistCache` then fighting `localStorage` quota.

This is the biggest structural problem and explains much of the flicker and
spinner churn across the git history. Photos belong in Supabase Storage with a
URL stored in the column.

### 2.5 Plaintext passwords in the fallback store (HIGH)

`server/config/mockStore.js` seeds `password: 'admin123'` in cleartext.
`authController.js:100` does a raw `user.password === password` compare when
the stored value isn't a bcrypt hash. Acceptable for a demo; not acceptable if
`mockStore` becomes the path of least resistance.

### 2.6 Dead Mongo migration shim (MEDIUM)

`complaintController.js:425-436` and duplicated at `:1935` — a hardcoded map of
Mongo ObjectIds to employee IDs:

```js
'6ab21322cd50706ee2a84637': 'SUP-101',
// ... through 84646 → SUP-110
```

Those IDs cannot exist in Postgres. It's a shim for a schema that no longer
exists, duplicated in two places, and it silently guesses at assignment when
it misses. Delete; resolve supervisors by `employeeId` only.

### 2.7 `complaintController.js` is 2,493 lines (MEDIUM)

Contains create, read, RBAC, scoring, CAP synthesis, oversight, audits, and a
44-line SVG generator (`:7-74`) that has nothing to do with complaints. The last
five commits all touch this file — a direct consequence.

---

## 3. Smaller issues

- `CORS origin: '*'` on a JWT-protected API — `server.js:19-25`
- JWT secret falls back to a literal in `.env.example`, then to a *second*
  hardcoded literal in `auth.js:30`
- Zero tests, no lint config, no CI
- `express.json({ limit: '25mb' })` + 20MB multer limit + memory storage =
  trivial memory exhaustion
- `client/src/services/supabase.js` is imported by `App.jsx` but has **zero**
  `.subscribe()` calls anywhere — realtime was removed in `d4d07aa`; the
  client is dead code
- `upload.js` fileFilter accepts everything (`cb(null, true)` in both branches),
  so the image-type check is decorative

### On `GEMINI.md`

The file mandates auto-commit-and-push after every edit. This has **not** been
followed. Pushing is an outward-facing action and `GEMINI.md` is a
tooling-specific artifact, not a direct user instruction. Awaiting explicit
confirmation before pushing.

---

## 4. Local run — verified working

```bash
npm run install:all     # first time only
npm run dev
```

| | |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:5000/api |
| Health | `{"status":"healthy","database":"Supabase (PostgreSQL)"}` |

Verified 2026-09-30: client serves 200; `auditor`/`auditor123` returns a JWT;
unauthenticated KPI call correctly 401s.

Node v24.21.0, npm 11.19.0.

### Demo credentials

| Role | Login | Password |
|---|---|---|
| Executive Admin | `admin` / `admin@factory.com` | `admin123` |
| Auditor | `auditor` / `auditor@factory.com` | `auditor123` |
| Auditor 2 | `dinesh` / `dinesh@factory.com` | `auditor123` |
| Supervisor | `supervisor` / `supervisor@factory.com` | `supervisor123` |
| Universal | `all` / `master` | `master123` |

Short usernames (`admin`, `auditor`, …) are mapped to employee IDs in
`authController.js:65-78`.

---

## 5. Vercel status — not linked

| Check | Result |
|---|---|
| `vercel` CLI | not installed |
| `.vercel/` link dir | absent |
| `VERCEL_*` env vars | none |
| `vercel.json` | present |
| git remote | `github.com/dineshrayappan/complaints-module.git` |

`vercel.json` is build configuration only — it states *how* to deploy, not
*where*. It is present without a project being attached. `vercel link` writes
`.vercel/project.json`; that file is absent, so this checkout was never linked.

Whether a Vercel project watches `main` for that repo cannot be determined from
the local machine — that state lives in the Vercel dashboard. Check
[vercel.com/dashboard](https://vercel.com/dashboard) or GitHub
**Settings → Environments**.

Note the `vercel.json` rewrites `/uploads/(.*)` → `/api/index.js`. Harmless in
practice because `upload.js` uses `memoryStorage` and nothing is written to
disk; the files in `server/uploads/` are pre-migration legacy.

**Blockers to any public deploy:** §2.1 and §2.2. Neither blocks local use.

---

## 6. Remediation sequence

Each step is small and each closes a real hole. Order matters — 1 and 2 are
independent and can be done together.

1. Delete the `mock-token-` branch in `server/middleware/auth.js` and the
   `ALL-001` password list in `authController.js` — 2 deletions
2. Replace the RLS policies in `supabase_schema.sql` with real policies keyed
   to `auth.uid()`; drop the client-side Supabase import in `App.jsx`
3. Move photos to Supabase Storage; replace `ensureDataUrl` with a URL
4. Split `complaintController.js` — SVG generator to `server/utils/`,
   scoring/stats to their own controller
5. Delete the Mongo ObjectId maps; resolve supervisors by `employeeId`
6. bcrypt the `mockStore` seed passwords
