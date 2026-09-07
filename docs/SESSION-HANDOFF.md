# Session handoff

Last updated: 7 September 2026. Read this file before continuing. It is the single
running record for this project; the earlier standalone `review.md` has been folded
in here and deleted.

## Current release

- Production: https://portal.getkoodos.com (also https://my-workspace-beta-jet.vercel.app).
- Content delivery and real branding shipped in commit `e0111e3` on `main`.
- Publishing and navigation improvements shipped through PR #1, merged as `5d51e6f`.
- Admin client layout rework shipped through PR #2, merged as `d44efcf`.
- URL artifact import shipped through PR #3 and was removed again the same day — see below.
- PR #4 fixed the artifact font CSP; PR #5 moved artifacts onto their own served policy,
  merged as `4d9c9f7`; PR #6 refused viewer-page imports, merged as `b3358b0`.
- PR #7 removed URL artifact import, merged as `21308c8`.
- Production deployments follow every merge to `main` automatically; check Vercel for the
  current one rather than trusting a deployment id recorded here.
- The user tests through production because their magic links return there, and because
  the ShipStudio preview cannot hold an authenticated session. Ship to production for review.

## User review — approved 7 September

The user approved the admin layout and confirmed fully encapsulated HTML renders perfectly.
They explicitly authorised building the agreed work tracks and client view using the current
design language, and progressing the release to main for production magic-link testing.
Keep updates brief. No further approval is needed for this release.

## Work tracks and admin board — implemented 7 September

The agreed reporting feature is built. This is delivery reporting, not task management.
PRD section 11 now separates the implemented tracks from future individual tasks.

### Agreed decisions preserved

- Tracks sit above folders. Stages are standard across clients; folders are filing categories.
  Turning folders into pipeline columns would misrepresent the work.
- Six ordered stages form the client progress spine: Discovery → Research → Plan → Build →
  Review → Launch. Each expands to its description, expected deliverable, note and shared items.
- Operate is an ongoing service, with an explicit editable recurring flag. It appears below the
  client spine and in an Ongoing strip below the admin board, never as a final pipeline column.
- Client filing stays flat, with a track chip on each assigned folder and links from stage to
  folder. Three levels of track → folder → item would be too much on a phone.
- Admin columns are statuses. The default shows In progress, Waiting on client, and On hold.
  Show all stages reveals Not started and Done. Every card supports a status select as well as
  drag, so keyboard/mobile users and transitions into hidden columns remain supported.
- Client filters are URL-driven chips with counts; show-all and client filters compose and
  are bookmarkable. Revisit chips beyond roughly 8–10 clients.
- The client label is “Waiting on you”; the admin label is “Waiting on client”.
- Counts and dates are derived from published, unarchived items in active linked folders.
  Admin previews use the same publication filters. Drafts never inflate client counts.
- Status and short client updates are immediately visible when saved. Content still starts
  as a draft and requires explicit publishing.
- No tasks, requests, deadlines, assignees, comments, notifications, or Needs attention chip.
  Status history is not written to events in v1.

### Schema and implementation

- Migration 004 adds tracks with composite (id, client_id) uniqueness, matching folder RLS,
  and nullable folders.track_id with a composite FK. No existing content is moved or changed.
- The migration seeds seven tracks for every existing client. New clients receive the same
  defaults atomically in createClient. Initial status is Not started; real progress is not guessed.
- DEFAULT_TRACKS in src/lib/tracks.ts holds editable application defaults. The migration
  contains an immutable copy for backfilling existing clients.
- A database trigger maintains status_changed_at only when status changes. An additional
  note_updated_at dates note edits independently, avoiding misleading old dates on new notes.
- Admin client management supports create, edit, reorder with arrows, archive and restore,
  plus optional track assignment on the existing folder row. Track archiving hides reporting,
  leaving folders/content available. Restoring a track restores its existing assignments.
- The client view handles not-started, active, fully-completed and recurring-only workspaces.
- The board displays status age, uses the existing drag-handle style, waits for hydration
  before enabling controls, and resets horizontal scrolling when switching live/all stages.

### Standard process and expected output

| Stage | What happens | Deliverable |
|---|---|---|
| Discovery | A working session on the business, the buyers and the constraints | Written brief |
| Research | Market, competitor and search analysis; content gap and citation audit | Research pack |
| Plan | Sitemap, content model, design direction, stack recommendation | Plan for approval |
| Build | Design and development against the approved plan | Staging site |
| Review | One structured round of changes, tracked in writing | Change log |
| Launch | Migration, redirects, analytics, handover documentation | Live site and keys |
| Operate | Monitoring, fixes, measurement — and content, if you want it | Quarterly report |

### Verification and release

- TypeScript and production build pass; track RLS checks pass, including cross-client FK,
  client write denial, archive/revocation and independent status/note timestamp behavior.
- The tracks browser test covers seeding, note/status updates, folder assignment, safe counts,
  member isolation, board filtering, select-to-Done with hidden columns, real drag, rename,
  reorder, archive/restore, recurring tracks and desktop/mobile layouts.
- Reviewed desktop and 390px mobile screenshots. The existing content-delivery regression
  suite passes, including private uploads, sandboxed artifacts, publishing and revocation.
  The final tracks run also verifies the fully-completed delivery state.
- Fixed the existing RLS runner's environment loading: loadEnvConfig requires the explicit
  development argument. It now also refuses a production host. The initial old-runner check
  failed on the absent tracks table in production and rolled its entire transaction back.
- Neon CLI has no authenticated account in this session. Development migration/testing uses
  the existing separate development database; direct connections are used for migrations.
- Migration 004 was rehearsed against existing production data in a transaction that was
  fully rolled back: 14 tracks for two clients. This verifies backfilling without a Neon API
  login. It was not a Neon branch rehearsal. The additive migration is applied before the
  code reaches production. Its LF line endings are pinned for consistent migration checksums.
- Migration 004 is now applied in production: 14 default tracks across two existing clients.
  Both browser suites, RLS checks, TypeScript and the final production build pass.

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
- **Artifact isolation.** Artifacts are served from `/api/items/[id]/render` under
  `ARTIFACT_CSP`, never through `srcDoc`. `sandbox allow-scripts` in that response header —
  with no `allow-same-origin` — puts the document on an opaque origin however it is reached,
  including direct navigation, so it can never touch the session cookie. `connect-src 'none'`
  keeps it from calling home. The iframe repeats the sandbox attribute as a second layer.

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

## URL artifact import — built, then removed (7 September)

Built in PR #3 and removed the same day. The intended source was almost always a Claude
artifact, and Claude share links cannot be imported at all (below), so the feature carried a
server-side URL fetcher and an SSRF guard for a case it could never serve. The user now prompts
Claude for self-contained artifacts and uploads the exported file, which works.

Removed: the `UrlImport` component and both its mount points, `importFromUrl` and
`discardImport`, `/api/import-preview`, `src/lib/safe-fetch.ts`, `src/lib/address-guard.ts`, the
address-guard spec, the import block in the content-delivery spec, and the import CSS.

**Server actions stay remotely callable even with no UI referencing them**, so removing the
component alone would have left an authenticated admin able to invoke `importFromUrl`. That is
why the whole feature went rather than just its surface.

Kept, because artifact viewing depends on them: `/api/items/[id]/render`,
`src/lib/artifact-response.ts`, `src/lib/artifact-hosts.ts`, and the proxy's `SELF_POLICED`
entry for the render route.

If import is ever wanted again — for a self-hosted page that genuinely is one document — the
whole implementation including the SSRF guard and its tests is one revert away in PR #3, and the
guard's design notes are in that PR.

### Artifacts are served from their own route, under their own policy (7 September)

The user's artifacts are almost all Claude-authored HTML, which routinely references CDN
scripts and Google Fonts from the `<head>`. They chose to allow those hosts rather than inline
the assets, because inlining would store another copy of Tailwind and the same font files in
Blob for every artifact *and every version*, and privacy is not a concern for this content.

Allowing CDNs naively was not possible: artifacts rendered through `srcdoc`, and a srcdoc
document **inherits the embedder's CSP**, so permitting `unpkg`/`cdnjs` for artifacts would have
permitted them for the admin portal itself. So artifacts now load from their own routes instead:

- `GET /api/items/[id]/render` — the stored artifact, access decided by RLS inside `withActor`
  exactly as the download route is, and restricted to `type='artifact'` so a stored PDF can
  never be served as HTML.
- `GET /api/import-preview?receipt=…` — a staged, unsaved import, authorised by the same
  HMAC-signed actor-bound ticket the commit path uses.
- Both send `ARTIFACT_CSP` from `src/lib/artifact-response.ts`. The allowed hosts live in
  `src/lib/artifact-hosts.ts` and are shared with the import preview's warnings.

**`sandbox allow-scripts` in that response CSP is load-bearing.** It puts the document on an
opaque origin however it is reached, so even opening the render URL directly in a tab cannot
touch the session cookie. Do not remove it. `connect-src 'none'` also stays: an artifact
renders, it does not call home.

**The proxy must leave these routes alone.** `src/proxy.ts` overwrites the CSP on everything it
matches, including `/api/*`. It stomped the artifact policy — including `frame-ancestors 'none'`,
which silently stopped the item page from framing the artifact at all — until the routes were
added to `SELF_POLICED`. The header was correct in code and wrong at runtime; only the
end-to-end test caught it. If artifacts ever render blank again, check this first.

This deleted `artifact-html.ts` and the client-side sanitiser with it. The viewer is now a plain
iframe pointed at the route, so the old "the child must reuse the parent's nonce" constraint is
gone, along with the `nonce` prop threaded through both pages.

The e2e artifact fixture now references `fonts.googleapis.com` and a deliberately non-existent
file on `cdn.jsdelivr.net`. The suite's existing "no CSP violations" assertion therefore proves
the allowed hosts really are permitted; a 404 is a network error, not a policy one, so this needs
no real library. One cold-start flake was seen on the first run after adding them; clean since.

### Claude share links cannot be imported — settled, do not investigate again

Traced properly on 7 September against a real shared artifact, so nobody spends the time a
fourth time. `https://claude.ai/code/artifact/<id>`:

1. Returns a 15 KB **frame shell**, title "Claude Artifact", with one script from
   `assets-proxy.anthropic.com` and no artifact content in the body.
2. The shell's only job is to load the real document from `/api/frame/<id>` on claude.ai.
3. That endpoint answers an automated request with **HTTP 403 and a Cloudflare bot challenge**.

So there is no fetchable document behind the link. This is not a gap in the importer and no
amount of archiving, inlining or CDN allowlisting changes it. Working around the bot protection
is out of scope on principle, and would break on their next deploy regardless.

The importer that would have hit this is gone, so no guard against these URLs is needed any more.
The finding is recorded here only so the conclusion is not re-derived: there is nothing to fetch
behind a Claude share link, whatever tooling is pointed at it.

The route that works for Claude-authored HTML is: export/download the artifact as a
self-contained HTML file and upload it. With artifacts now served under their own policy, such a
file renders correctly including its CDN scripts and fonts.

### What URL import can and cannot take (learned 7 September)

The user imported a Claude artifact **share URL** and got a dark, empty page. That is expected
and not fixable by improving the importer: a share link is an application page that renders the
artifact inside its own nested frame, so fetching it returns the wrapper shell, not the artifact
document. No amount of archiving changes that — you would be storing the viewer, not the work.

**The right path for a Claude artifact is to export/download it as a self-contained HTML file
and upload that**, which the dropzone already handles and the e2e suite already proves works,
including interactive scripts inside the sandbox.

URL import is for pages that are genuinely one self-contained document. The preview now says so
loudly: if the page loads its code from separate files it shows a red "This page will not work
as an artifact" notice naming the count and pointing at the export route, rather than letting an
admin publish a blank page and find out from the client.

Two real bugs were found from that report and fixed:

- **No artifact font could ever load, uploaded or imported.** The parent CSP said
  `font-src 'self'` and the injected sandbox policy said `font-src data:`; a srcdoc document
  inherits the embedder's policy, so the intersection was empty. `src/proxy.ts` now sends
  `font-src 'self' data:`. Note `img-src` has the same shape — parent `'self' data:` against
  sandbox `data: blob:` — so `blob:` images still cannot load. Left as is deliberately; widen the
  parent only if an artifact needs it.
- **The "external resources" warning only counted absolute URLs.** The regex required
  `http://` or `//`, so the common case — a bundle referenced as `/assets/index-abc.js` — scored
  zero and no warning appeared. Anything not already `data:`/`blob:` is unreachable once the
  document sits on an opaque origin with no base URL, and is now counted as such.

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

1. Collect production feedback on the work tracks, client progress spine and admin board.
2. The older admin layout and HTML rendering are approved; do not ask for that approval again.
3. Follow the remaining-work list above for future scope. Individual tasks remain future work.

The agreed reporting plan has no open design questions. Keep this file current as work progresses.
