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

## Awaiting user review

The admin client layout (PR #2) and the artifact policy change (PR #5) are both live but have
not been reviewed in production. The user has confirmed archiving the broken imported artifacts.
Ask for feedback on the layout before building further on it.

URL import was removed in PR #7, merged as `21308c8`.

## Next feature — work tracks and an admin board (agreed 7 September, not built)

Agreed with the user, ready to build. **Nothing has been implemented.** One input is still
outstanding: the real `DEFAULT_TRACKS` names (see the end of this section).

### What this is, and what it is not

The user asked for "simplified project reporting that merely surfaces updates to clients". That
is **reporting, not task management**, and it is a different grain from the task system already
designed in PRD §11:

- **Tracks (this build)** are delivery *phases* — a handful per client, standard across clients.
- **Tasks (PRD §11, still future)** are individual work items with a request/accept/review
  lifecycle, due dates and assignees.

They can coexist later — tasks live inside tracks. Do not merge the two. In particular do not
reuse §11's `requested`/`accepted`/`review` statuses here: those describe a task's life, not a
phase the studio defined itself. PRD §11 should be amended during this build to separate the
two so the PRD stays coherent.

### Decisions taken (with reasons, so they are not silently reversed)

- **Tracks are a layer above folders, not folders with a status.** Tracks are the studio's
  standard stages and are consistent across clients; folder names are per-client content
  categories. Keeping reporting separate from filing is the point.
- **The board is admin-only; clients get a list.** A five-card board is mostly chrome and reads
  badly on a phone, which is where clients open this. The cross-client board is where a kanban
  actually pays off — as PRD §11 already anticipated.
- **Rejected: stages as columns with deliverables moving through them.** It looks cheap because
  items already sit in folders, but the folders are categories, not a pipeline — "Proposals" is
  not a stage that "SEO Research" follows. It would misrepresent the work.
- **Counts and dates are derived, never typed.** The only manual upkeep is a status and a
  one-line note. Manual status boards rot, and a board that lies to clients is worse than none.

### Schema — `database/migrations/004_tracks.sql`

```
tracks   id · client_id · name · summary · deliverable · position · recurring
         · status ('not_started'|'in_progress'|'waiting_on_client'|'on_hold'|'done')
         · status_note · status_changed_at · archived_at · created_at
         unique (id, client_id)

folders  + track_id uuid, nullable
         FK (track_id, client_id) references tracks(id, client_id)
```

- The composite FK is the pattern `items` already uses against `folders`: it makes cross-client
  mixing impossible in the database rather than by convention. Use it.
- `track_id` nullable, so a folder outside a reported stage simply does not appear in reporting.
- RLS mirrors `folders` exactly — read `is_admin() OR (can_access_client(client_id) AND
  archived_at IS NULL)`, insert/update `is_admin()`. No new policy patterns.
- A trigger sets `status_changed_at` on status change, like the existing `touch_item`, so "last
  changed" cannot drift because app code forgot.
- Deliberately **not** writing status changes to `events` in v1: it would need a new insert grant
  on that table for a history nobody has asked for yet. Easy to add later.

### Status labels differ by audience

Same enum, different words. `waiting_on_client` reads **"Waiting on you"** to the client and
**"Waiting on client"** on the admin board — "waiting on you" on the studio's own board would be
actively confusing.

### Surfaces

| Where | What |
|---|---|
| `createClient` action | Seeds the standard tracks on client creation, editable per client after |
| `/admin/clients/[id]` | Track section: create, rename, reorder, archive, set status and note. A track picker on each folder row, reusing the existing folder row layout |
| `/admin/board` | Kanban across all clients. Columns are statuses, cards are tracks with the client name, drag to change status reusing the `FolderControls` pattern |
| `/c/[slug]` | A compact "Where things stand" panel above the existing content listing: track, status chip, dated note, and derived "N deliverables · last updated 4 Sept" |

### Board filtering

Client **chips, not a select**: `All (12) · Rooted Education (4) · Client B (5)`, with counts so
the work's location is visible before clicking. Driven by a URL parameter,
`/admin/board?client=<slug>`, which keeps the board a server component with no filter state,
makes a filtered view bookmarkable during a call, and needs no JavaScript — the chips are plain
links, matching how `/workspaces?all=1` already works. Drag-to-change-status stays the only
interactive piece. When filtered to one client the per-card client name drops to a muted line.

**This stops scaling past roughly 8–10 clients**, where the chips wrap into an unreadable block
and it wants a search or select instead. Recorded so that is a deliberate revisit rather than a
slow degradation.

### Judgement call to revisit on sight

The client content listing stays **flat** — status panel on top, then the existing folder listing
with a small track chip per folder. Nesting track → folder → items is three levels on a phone.
The user may overrule once it is visible.

### Explicitly out of scope

Tasks, client-raised requests, due dates, assignees, track comments, notifications.

### Parked, offered but not decided

A **"Needs attention"** chip beside the client chips, filtering to tracks that are
`waiting_on_client` or unchanged for 14+ days — the same query shape, and the view worth opening
on a Monday. The user has not said whether it is in the first cut.

### Risk

Staleness is the one that kills this feature. Mitigation: the admin board shows "unchanged for
N days" on each card, so a rotting track is visible to the studio before it is visible to a client.

### Estimate and the outstanding input

About two days: the migration and seeding are small, the board and track management are the bulk.

### The real process — `DEFAULT_TRACKS` (supplied 7 September)

Seven stages, in order. Each has a description and, importantly, a named deliverable.

| # | Stage | What happens | What you get |
|---|---|---|---|
| 1 | Discovery | A working session on the business, the buyers and the constraints | Written brief |
| 2 | Research | Market, competitor and search analysis; content gap and citation audit | Research pack |
| 3 | Plan | Sitemap, content model, design direction, stack recommendation | Plan for approval |
| 4 | Build | Design and development against the approved plan | Staging site |
| 5 | Review | One structured round of changes, tracked in writing | Change log |
| 6 | Launch | Migration, redirects, analytics, handover documentation | Live site and keys |
| 7 | Operate | Monitoring, fixes, measurement — and content, if you want it | Quarterly report |

Seed as an editable constant, e.g. `{ name, summary, deliverable }` per entry, positioned 1000
apart in this order.

### Two schema additions this justifies

Add `summary text` and `deliverable text` to `tracks`, seeded from the table above.

The deliverable column is the highest-value part. A client's actual question is not "what status
is Research" but **"where is my research pack"**. A track that names its expected output turns a
status chip into an answer: *"Research — In progress — you'll get: Research pack · 3 items · last
updated 4 Sept"*. Both fields are per-client editable after seeding.

### The process is linear, which changes the client view

Discovery → Research → Plan → Build → Review → Launch → Operate is a genuine sequence, unlike
folders. That has three consequences:

- It confirms tracks, not folders-with-a-status, were the right model — folders are categories,
  this is a pipeline.
- Order is meaningful and must not be sorted by anything but `position`.
- **The client view should be a progress spine, not seven status chips.** "Stage 4 of 7 · Build"
  with the completed stages behind it and the rest ahead answers "where are we" in one glance,
  which seven chips do not. This supersedes the "compact status panel" described above — build
  the spine, with each stage expandable to its note and deliverable.

Stages 3 and 5 ("Plan for approval", "Review") are the natural homes for `waiting_on_client`,
which validates keeping that status.

### Both edge cases decided (7 September)

**Operate is presented separately, not as the end of the spine.** It is an ongoing service with a
recurring quarterly report, so showing it as stage 7 of a sequence implies it is the last thing
that happens rather than the thing that continues.

- Add `recurring boolean not null default false` to `tracks`, seeded true for Operate. An
  explicit column, not a match on name or position — those are fragile and the user can rename.
- **Client view:** the progress spine covers stages 1–6. Operate renders below it as its own
  panel — an ongoing service with its status, note and deliverable, not a step to be completed.
- **Admin board:** recurring tracks are excluded from the kanban entirely and appear in a compact
  "Ongoing" strip beneath it, one row per client with status and last-changed. This mirrors the
  client view, and avoids the subtler alternative of special-casing a recurring track's status
  inside the columns.

**The board hides `not_started` and `done` by default.** Default columns are therefore
`in_progress`, `waiting_on_client`, `on_hold` — live work only. A "Show all stages" chip reveals
the rest, as a URL parameter (`/admin/board?show=all`) for the same reasons the client filter is.

**The consequence that matters: hiding `done` would break dragging a card to done**, which is the
most common action on the board. So each card carries a **status control as well as drag**. That
is needed regardless — drag alone is not keyboard accessible, and it is the same reason
`FolderControls` kept arrow buttons alongside its drag handle. With a control on the card, hidden
columns cost nothing. Slim always-visible drop zones at either edge are optional polish, not
required.

### "Needs attention" chip — now parked as probably redundant

Hiding `not_started` and `done` makes the default board *already* a live-work view, which was
most of what that chip was for. What it would still add is narrowing to `waiting_on_client` plus
tracks unchanged for 14+ days. Do not build it in the first cut; revisit only if the default view
proves too noisy in real use.

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

1. Build work tracks and the admin board to the agreed plan above. Read that section in full
   before starting: several decisions there were taken against cheaper-looking alternatives, and
   the reasons are recorded so they are not silently reversed. The real seven-stage process and
   its deliverables are recorded there too.
2. Also collect the user's production feedback on the admin client layout (PR #2) and the
   artifact policy change (PR #5), neither of which has been reviewed yet.

The plan carries no open questions. Every decision needed to start is recorded, including the
seven stages and their deliverables.

Everything merged is already live; no deployment approval is outstanding. Keep this file current
as work progresses.
