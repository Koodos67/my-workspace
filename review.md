# Code review — `feat/admin-content-delivery`

Reviewer: Claude (Opus 5), read-only pass. Date: 2026-09-06.
Scope: whole repo, with focus on the admin content-delivery branch.
**No code was changed to produce this review.**

Reference this file at the start of the next cycle. Items are ordered by what I would fix first.

---

## 1. Context

Next 16 App Router / React 19 / TypeScript 7, Neon Postgres, Better Auth, Resend,
private Vercel Blob. Roughly 840 lines of application code in total.

The branch implements: admin upload → immutable versioning → draft/publish →
private delivery via short-lived presigned URLs → sandboxed HTML artifact viewing.

---

## 2. What is working well — keep this, do not refactor it away

These are the load-bearing parts. Any future change should preserve their properties.

**Actor-scoped transactions (`src/lib/db.ts`).**
`withActor()` opens a transaction, runs `SET LOCAL ROLE koodos_app`, sets
`app.user_id` via `set_config(..., true)`, and everything else is enforced by
Postgres RLS. The application layer never asserts identity outside a transaction,
so it cannot be spoofed from app code. `SET LOCAL` is transaction-scoped, so pooled
connection reuse is safe here.

**RLS recursion is handled correctly (`database/migrations/002_workspace.sql`).**
`private.is_admin()`, `private.can_access_client()` and `private.can_read_item()`
are `security definer` with `set search_path = ''`, revoked from `public` and
granted only to `koodos_app`. This is the pattern most implementations get wrong.

**Role escalation is closed.**
`private.handle_new_user()` inserts profiles at the default `'client'` role and
ignores submitted user metadata; admin is set only by `scripts/seed-admin.ts`.
Migration 003 revokes all auth tables (`user`, `session`, `account`, `verification`,
`rateLimit`) from `koodos_app`.

**The upload handshake (`src/app/admin/content-actions.ts`, `src/lib/content.ts`).**
HMAC-signed ticket bound to actor + pathname + 15-minute expiry, verified with a
length pre-check then `timingSafeEqual`; a Blob client token scoped to one pathname
with `allowOverwrite:false` and `addRandomSuffix:false`; server-side `head()`
re-verification of pathname and size before any DB write; `finishUpload` idempotent
on `versionId`. Delivery is a 60-second presigned URL on a private store, and the
e2e test asserts the URL fails once its signature is stripped.

**The artifact sandbox is real isolation (`src/components/artifact-viewer.tsx`).**
`srcDoc` + `sandbox="allow-scripts"` without `allow-same-origin` gives an opaque
origin; `<base>` and meta-refresh are stripped, external `<script src>` removed,
and a `default-src 'none'` CSP is injected. The test asserts both that inner scripts
run and that they cannot reach the parent document.

---

## 3. Issues to fix

### 3.1 — Blocking: the upload path can hang forever with no error
Files: `src/components/upload-panel.tsx:40,44`, `tests/content-delivery.spec.ts:43`

The e2e test `admin delivers private versioned content` fails waiting 60s for
`1 file added as drafts.`. The saved failure context
(`.shipstudio/test-results/.../error-context.md`) shows the "Upload into" combobox
in state `[disabled]`.

That control is `disabled={!ready || busy}`. `ready` must already have been true,
because the earlier `selectOption({label:'Reports'})` in the spec succeeded and
Playwright auto-waits for an enabled element. Therefore `busy` was still `true`
after 60 seconds: **the upload neither resolved nor threw.**

This is not only a test problem. `upload()` has no timeout and no abort:
`prepareUpload` → `put()` → `finishUpload` are awaited unconditionally. A stalled
call leaves the panel permanently disabled displaying "Uploading …%", with no error
surfaced and no way for the admin to retry short of a page reload.

Required:
- Add a timeout / `AbortController` around the client `put()` and the two server
  actions, with the error surfaced through the existing `setError` path.
- Re-run `npm run test:e2e` and identify which of the three awaits actually stalls
  before assuming the fix is complete.

Root cause is **not** established — nothing was executed for this review. Do not
patch the assertion or raise the timeout; find the stall.

### 3.2 — High: owner-pool queries silently bypass RLS
File: `database/migrations/002_workspace.sql:118-133`

RLS is enabled on every table but never `FORCE`d, so the migration/owner role is
exempt from all policies. The entire isolation model therefore rests on the
convention "application data must go through `withActor`", enforced only by a comment
in `src/lib/db.ts` and a paragraph in the README.

Fix: `ALTER TABLE <each> FORCE ROW LEVEL SECURITY;` in a new migration, then confirm
Better Auth, `scripts/migrate.ts` and `scripts/seed-admin.ts` still work — those
legitimately need the owner connection and may need explicit policy carve-outs or to
run as a role that is exempt by design. This turns a convention into a structural
guarantee.

### 3.3 — High: server actions are written at unreadable density
File: `src/app/admin/content-actions.ts` (notably `editItem`, line 73)

Multiple statements per line, and `editItem`'s `UPDATE` is a single ~700-character
SQL string containing nested `CASE` expressions and a correlated subquery for
position, with seven positional parameters supplied by an inline argument list that
includes a conditional `webUrl(...)` call.

As far as I can determine it is correct. It is also effectively unmodifiable: the next
person to change publish semantics or folder-move ordering cannot verify their change
by reading it. Same pattern in `moveItem`, `finishUpload`, and `upload-panel.tsx`.

Fix while the surface is still ~840 lines: break the SQL onto multiple lines with named
intent, split multi-statement lines, and extract the position-recalculation into a named
helper shared by `createLink`, `finishUpload` and `editItem`. No behaviour change intended —
this should be reviewable as a pure formatting/extraction commit.

### 3.4 — Medium: no blob or version lifecycle
Files: `database/migrations/002_workspace.sql:131-134`, `src/app/admin/content-actions.ts`

Archiving is soft-only (`archived_at`), there are no `DELETE` grants on `items` or
`item_versions`, and nothing ever deletes from Vercel Blob. Every superseded version of
every replaced file is retained indefinitely, including uploads from abandoned drafts.

Decide the retention policy before the store grows: at minimum, a cleanup path for
versions whose ticket was signed but whose `finishUpload` never landed, and a documented
answer for what "delete this item" means to a client.

### 3.5 — Medium: `comments` and `acknowledgements` are schema-only
File: `database/migrations/002_workspace.sql`

Both tables exist with read policies, but neither has an `INSERT` grant to `koodos_app`
and neither has any UI. The schema reads as more complete than the product is. The
README "Delivery status" section is accurate about this; keep it that way, and either
build the write path or note in the migration that these are forward declarations.

### 3.6 — Low: the artifact viewer reuses the parent page's CSP nonce
File: `src/components/artifact-viewer.tsx:15,18`

`activeNonce` is read from the host document's `script[nonce]` and then written into
the sandboxed document's injected CSP and onto its inline scripts. This is harmless
today because the iframe has no `allow-same-origin` and therefore an opaque origin.
It is a fragile coupling: if `allow-same-origin` is ever added to that iframe, uploaded
HTML holds a valid nonce for the application's own origin.

Fix: generate a fresh random nonce inside the viewer. It costs one line and removes the
dependency entirely.

### 3.7 — Low: e2e test brittleness
File: `tests/content-delivery.spec.ts`

- `login()` hand-forges Better Auth session cookies as `token + '.' + HMAC-SHA256(token)`.
  Any change to Better Auth's cookie format breaks the whole suite with a misleading failure.
- The suite runs against the real development Neon database and the real Blob store. The
  guards are good (localhost-only, refuses to run if `DATABASE_URL` matches
  `.env.production.local`), but it is still destructive against dev data and depends on
  network Blob calls inside assertions with 60s timeouts.

The coverage itself is strong — draft invisibility, cross-tenant 404s, sandbox escape,
version pinning, membership revocation. Worth keeping; worth insulating from Better Auth
internals.

---

## 4. Environment and repo blockers — not code defects

**Git is unusable in this working directory.**
`.git` is owned by `KOODOS-1\CodexSandboxOffline`; the current user is `KOODOS-1\Brutus`.
Every git command aborts with "detected dubious ownership". Nobody can commit, diff, or
review this branch until that is resolved. This was deliberately **not** applied, since
it mutates global git config:

```
git config --global --add safe.directory C:/Users/marku/ShipStudio/my-workspace
```

**Two dev servers were competing.**
`package.json:5` runs `next dev` on the default port 3000, while `playwright.config.ts`
targets `http://localhost:3198`. The logs show both an `EADDRINUSE` on 3000
(`.shipstudio/next-dev-error.log`) and "Another next dev server is already running" on
3198 (`.shipstudio/admin-dev-error.log`). Pin the port in the `dev` script so the server
and the test config cannot disagree. This may also be implicated in 3.1.

**Secrets are clean.** `.gitignore` and `.vercelignore` both cover `.env*` with only
`.env.example` exempted. `.env.production.local` holds production Neon credentials in the
working tree but is correctly ignored; auth and Resend secrets are only in Vercel env vars.

---

## 5. Recommended order of work

1. Diagnose and fix the upload stall (3.1) — it blocks the branch's own test.
2. Fix the git ownership blocker (section 4) — nothing can be reviewed or merged without it.
3. Pin the dev port (section 4).
4. `FORCE ROW LEVEL SECURITY` (3.2) — small, high value, do it before more surface is added.
5. Readability pass on the server actions (3.3) as a standalone no-behaviour-change commit.
6. Then decide on lifecycle (3.4) and comments/acks (3.5) as product scope.

The foundation is sound and worth building on rather than replacing.
