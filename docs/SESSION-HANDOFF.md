# Session handoff

Last updated: 6 September 2026. Read this file before continuing. It is the single
running record for this project; the earlier standalone `review.md` has been folded
in here and deleted.

## Current release

- Production: https://portal.getkoodos.com (also https://my-workspace-beta-jet.vercel.app).
- Content delivery and real branding shipped in commit `e0111e3` on `main`.
- Publishing and navigation improvements shipped through PR #1, merged as `5d51e6f`.
- Admin client layout rework shipped through PR #2:
  https://github.com/Koodos67/my-workspace/pull/2
- Latest production deployment `my-workspace-idkhz7sl3` is Ready and aliased to the
  production portal; the new stylesheet is confirmed live.
- The user tests through production because their magic links return there, and because
  the ShipStudio preview cannot hold an authenticated session. Ship to production for review.

## Awaiting user review

PR #2 (admin client layout) is live but the user has not yet reviewed it in production.
Start the next session by asking for that feedback before building on this layout.

## Completed 6 September — session two (admin client layout)

Requested: make the drop area obvious, tidy the folder tools onto one line with real
drag-and-drop, add lucide icons for type differentiation, and separate members and
settings from the rest of the page.

- **Upload dropzone.** Rebuilt as an explicit target: dashed border, icon, "Drag and drop
  files here", an `or` divider and a **Choose files** button. Drag-active state uses an
  enter/leave depth counter so hovering child elements does not flicker. The file input is
  visually hidden (clip-path, not `display:none`) so it stays focusable and keeps its
  accessible name. The per-item version uploader uses the same pattern, smaller.
- **Folder tools.** One row per folder from tablet up: handle · folder icon · name field ·
  Save · up · down · Archive. Real drag-and-drop with a green insertion line on the
  prospective drop target, a dimmed source row, and a trailing "place last" zone shown only
  while dragging. `reorderFolder` now accepts a null `beforeId` meaning "move to the end".
  The arrow buttons remain as the keyboard-accessible path.
- **Icons.** Added `lucide-react` and `src/components/item-icon.tsx`, which maps type and
  mime to an icon plus a colour tile: folder, interactive artifact, link, image, document,
  spreadsheet, video, archive, generic file. The items query now also selects the current
  version's mime type to drive this.
- **Administration zone.** Members and workspace settings moved into a separate band with
  its own background and a note that nothing inside is client-visible. Members gained a
  stat row (with access / signed in / awaiting first sign-in) and one card per person with
  initials avatar, status badge, email and a dates grid, so one member's details cannot be
  misread as another's.
- **Two pre-existing defects fixed on the way.** `.sr-only` was referenced by the markup
  but never defined in CSS, so "Folder name" and "New folder name" labels rendered
  visibly. Tailwind preflight sets `svg{display:block}`, which broke icons onto their own
  line inside `summary` and headings; icons in text flow are now explicitly inline.

Verification: production build and TypeScript pass; the full end-to-end suite passes
(~1.2 min) including every selector the layout touches; desktop and mobile screenshots
reviewed with the mobile overflow assertion passing. No schema migration, no change to
auth, RLS or the upload/delivery security path.

## Completed 6 September — session one

### Review and upload failure

- Read the external review and checked its findings against the implementation.
- Diagnosed the stalled upload from the saved Playwright trace: the Blob SDK calls
  `https://vercel.com/api/blob/`, which the portal CSP blocked. SDK retries left progress at 0%.
- Allowed that specific API path in CSP while preserving private storage and sandbox restrictions.
- Added 45-second UI deadlines for preparation, transfer and save, with stage-specific errors
  and an AbortController for the transfer.
- Server actions cannot be cancelled by the browser. A save timeout explains that it may still
  complete and asks the admin to refresh/check before retrying.
- Set the default development port and example auth URL to localhost:3198, matching the suite.
- Expanded the dense item-edit SQL into readable lines without changing its behavior.
- Updated README delivery status and documented retention limitations.

### Branding

- Downloaded the user's original light SVG and preserved its vector geometry.
- Added `public/brand/koodos-logo-light.svg`, `-black.svg` and `-teal.svg` (exact teal `#00f5d0`).
- Added the shared `BrandLogo` component; the current light UI uses black on shell, login and not-found.

### Client visibility diagnosis

- Read-only production inspection found the two Rooted items were drafts: the HTML proposal
  and the DLT roofing example link. Both were in Proposal Artifacts at inspection time,
  including the link intended for the workspace root.
- The registered test member has active Rooted membership; the email supplied in chat had a typo.
- Explained how to publish and move the link. Did not change real items, membership or
  publication state during diagnosis.

### Publishing and navigation UX (PR #1)

- Highlighted Client visibility panel grouping the Share with client checkbox, copy and save action.
- Action-specific button labels: Save draft, Save & publish, Save changes, Save & unpublish.
- Item summaries say Draft / hidden from client or Published / visible to client, with an edit cue.
- Labelled back buttons with generous targets and visible hover/focus states, replacing subtle links.
- Admin previews return to management; client item views return to their workspace and folder anchor.
- Added Back to all workspaces. `/workspaces?all=1` opens the chooser even for a
  single-workspace member, avoiding a redirect loop.

## What is sound and should not be casually refactored

These are load-bearing. Preserve their properties in any future change.

- **Actor-scoped transactions** (`src/lib/db.ts`). `withActor()` opens a transaction, runs
  `SET LOCAL ROLE koodos_app`, sets `app.user_id`, and lets Postgres RLS do the rest. The app
  layer never asserts identity outside a transaction. `SET LOCAL` is transaction-scoped, so
  pooled connection reuse is safe.
- **Non-recursive RLS helpers.** `private.is_admin()`, `can_access_client()` and
  `can_read_item()` are `security definer` with `search_path = ''`, revoked from `public`,
  granted only to `koodos_app`.
- **No role escalation.** `handle_new_user()` inserts profiles at the default `client` role and
  ignores submitted metadata; admin is set only by `scripts/seed-admin.ts`. Migration 003
  revokes all auth tables from `koodos_app`.
- **Upload handshake.** HMAC-signed ticket bound to actor, pathname and a 15-minute expiry,
  verified with a length pre-check then `timingSafeEqual`; a Blob client token scoped to one
  pathname with `allowOverwrite:false`; server-side `head()` re-verification before any DB
  write; `finishUpload` idempotent on `versionId`. Delivery is a 60-second presigned URL.
- **Artifact sandbox.** `srcDoc` plus `sandbox="allow-scripts"` without `allow-same-origin`
  gives an opaque origin; `<base>`, meta-refresh and external scripts are stripped and a
  `default-src 'none'` policy is injected.

## Two rejected suggestions — do not re-raise without new evidence

Both were raised in review and both are wrong as stated. Recorded here with the reason so
nobody spends the time again.

- **`FORCE ROW LEVEL SECURITY` is not a one-line hardening win.** Security-definer helpers run
  as the table owner. Under FORCE, `private.is_admin()` querying `profiles` becomes subject to
  `profiles_read`, which calls `is_admin()` — infinite recursion. Closing the owner-bypass gap
  needs a separate restricted runtime role design plus tests, not a migration one-liner.
- **Do not randomize the artifact iframe nonce.** A `srcdoc` document inherits the embedder's
  CSP, so a fresh nonce would stop inline scripts in the sandbox from running at all. If this
  design is ever changed, verify both inline execution and parent isolation.

## Proposed next feature — ingest an artifact from its public URL

Requested 6 September. Paste the public share URL of a single-page artifact and store it
exactly as an uploaded one, instead of downloading and re-uploading it by hand.

**Verdict: easy for the happy path.** The plumbing is genuinely small — smaller than the
upload path, because the fetch happens on the server and so needs no signed ticket and no
Blob client token. Roughly 80 lines in `src/app/admin/content-actions.ts` plus a form and a
test. Reuse `webUrl()` for validation, then:

1. `requireAdmin()`, validate the URL.
2. Fetch server-side with an `AbortSignal` timeout and a hard read cap at `MAX_UPLOAD`
   (check `content-length`, then still cap while reading — do not buffer unbounded).
3. Require a `text/html` response; extract `<title>` for the item title (server-side, so a
   regex rather than `DOMParser`).
4. Server-side `put()` from `@vercel/blob` with `access:'private'` and the existing pathname
   convention `${env}/${clientId}/${itemId}/${versionId}/${filename}`.
5. The same DB writes `finishUpload` already performs: insert the item (or reuse it for a
   replacement), insert the `item_version`, update `current_version_id`, then `refresh()`.

Because versioning already exists, "re-fetch this URL as a new version" is a natural
follow-up that costs almost nothing once step 1 works.

**What actually takes the time — two things, not the plumbing:**

- **SSRF.** This is a server-side fetch of a user-supplied URL, so it needs a real guard:
  block private and link-local ranges (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, the
  169.254.169.254 metadata address, ::1, fc00::/7), cap redirects, and re-check the
  *resolved* address after every hop rather than trusting the hostname, or DNS rebinding
  walks straight through it. `webUrl()` already rejects non-http(s) schemes and embedded
  credentials, so that part is done.
- **Fidelity, which is a product question.** It works perfectly for a self-contained
  single-file HTML artifact, which is the common case for a shared artifact URL. It degrades
  for a page whose CSS, JS or images live at other URLs — though note those subresources were
  never going to load anyway, since the viewer strips external scripts and injects
  `default-src 'none'`. It produces a blank page for a client-rendered SPA whose HTML is an
  empty shell. So the import should show a preview before saving, so the admin sees exactly
  what the client will see rather than discovering it later.

Provenance is worth keeping: the source URL fits in the existing `item_versions.version_note`
with no migration, or a dedicated `source_url` column if it deserves one.

Estimate: an afternoon for the happy path; about a day with the SSRF guard and
preview-before-save, which are both needed before it goes near production.

## Remaining work and constraints

- Keep new content as drafts until an admin explicitly publishes. Improve further only with
  evidence from use.
- Blob orphan cleanup and a permanent deletion/retention policy remain pending. Archive hides
  items; every superseded version is retained in Blob indefinitely, including uploads whose
  ticket was signed but whose `finishUpload` never landed. Decide the policy before the store grows.
- Comments and acknowledgements remain schema-only: both tables exist with read policies, but
  neither has an INSERT grant nor any UI. Inbox, exports and complete client branding controls
  are also pending.
- Automated real-email sign-in coverage remains pending. The existing integration tests forge
  Better Auth session cookies as `token + HMAC-SHA256(token)`, so any change to that cookie
  format breaks the suite with a misleading failure. They also run against the real development
  database and Blob store, guarded to localhost and against matching the production DATABASE_URL.
- The owner Postgres connection bypasses RLS. Application data must go through `withActor()`;
  this is currently a convention enforced only by a comment in `src/lib/db.ts`.

## Environment notes

- Workspace: `C:/Users/marku/ShipStudio/my-workspace`.
- Use `npm.cmd` / `npx.cmd` in PowerShell because execution policy blocks the `.ps1` wrappers.
- `rg` and `agent-browser` are unavailable here; use PowerShell searches and the installed
  Playwright tooling. Python is not on PATH either.
- Development server runs on localhost:3198 and was already listening; do not start a
  competing Next.js process. `npm run dev` pins that port to match the test config.
- Sandbox network restrictions require elevated execution for development DB tests and
  deployment commands.
- **Git ownership.** `.git` is owned by `KOODOS-1\CodexSandboxOffline` while sessions run as
  another user, so every git command needs `-c safe.directory=C:/Users/marku/ShipStudio/my-workspace`.
  For tools that shell out to git themselves — `gh` in particular — export the equivalent
  instead, which needs no global config change:
  `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=C:/Users/marku/ShipStudio/my-workspace`.
  No global trust configuration has been changed.
- The Vercel connector returned 403 for this project; authenticated `npx.cmd --yes vercel ...` works.
- `.agents/` contains pre-existing local skills and is deliberately left outside app commits.
  Next.js may rewrite `next-env.d.ts` between dev and production builds; avoid committing
  incidental generated-path changes.

## Next session

Start with the user's production feedback on the admin client layout (PR #2), then on
publishing and navigation. The latest release is already live; no outstanding deployment
approval is needed. Keep this file current as work progresses.
