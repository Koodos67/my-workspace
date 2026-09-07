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

## URL artifact import — built, PR #3

Paste the public URL of a single-page artifact and it is stored exactly like an upload.
Available in Add content → "Import an artifact from a URL", and inside any artifact item as
"Replace from a URL" to take a new version from the same source.

**How it works.** `importFromUrl` fetches server-side, stages the bytes in private Blob at the
normal pathname, and returns a signed `UploadTicket` plus the HTML. Nothing touches the
database at that point. Confirming calls the existing `finishUpload` with that receipt, so the
import reuses the audited commit path verbatim — `head()` verification, idempotency on
`versionId`, the same three writes. Discarding calls `discardImport`, which deletes the staged
blob unless a version row already exists, so a discard leaves no orphan. Provenance goes into
`item_versions.version_note` as `Imported from <final URL>`; no migration was needed.

**The SSRF guard** lives in `src/lib/address-guard.ts` (pure predicates) and
`src/lib/safe-fetch.ts` (the network side).

- Blocks loopback, private, link-local (including the 169.254.169.254 metadata address),
  CGNAT, benchmarking, documentation, multicast and reserved ranges, in IPv4 and IPv6, and
  unwraps IPv4-mapped, IPv4-compatible and NAT64 addresses so they cannot be used to smuggle a
  blocked v4 address through a v6 literal. Unparseable input is blocked, not allowed.
- Only http and https, only ports 80 and 443, no credentials in the URL.
- **The boundary is a connect-time `lookup` hook**, not a resolve-then-fetch check: only
  addresses that passed validation are handed back to the socket, so the connection cannot be
  pointed somewhere else after the check. That is what closes DNS rebinding. The pre-flight
  resolve in `fetchGuardedDocument` exists only to produce a clear error message and is not
  the security control — do not remove the lookup hook and keep the pre-flight.
- Every redirect hop is re-validated, capped at 3. `accept-encoding: identity` so the 25 MB cap
  cannot be defeated by a compression bomb. Response must be `text/html`, capped while
  streaming rather than after buffering.

**Fidelity is surfaced, not hidden.** The preview renders the fetched HTML in the same sandbox
the client gets, and warns when the page pulls scripts, stylesheets or images from other
addresses (they will not load), and when the page has almost no text of its own and builds
itself with JavaScript (the client may see a blank page). The admin decides before saving.

Coverage: `tests/address-guard.spec.ts` is a browser-free table test over the address and URL
predicates. `tests/content-delivery.spec.ts` drives the UI through six refusals and then a real
import of `https://example.com/`, asserting nothing is written before confirmation and that the
saved item is a draft artifact with `text/html` and the provenance note.

Known gap: the title comes from the fetched `<title>` and cannot be edited in the preview —
rename after saving via the normal item edit form.

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

`assertNotAViewerPage` in `content-actions.ts` now refuses these URLs **before fetching**, so the
attempt costs no request and stages no file. The message points at the export route. Add other
viewer-page patterns to `VIEWER_PAGES` if more turn up.

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

Start with the user's production feedback on the admin client layout (PR #2), then on
publishing and navigation. The latest release is already live; no outstanding deployment
approval is needed. Keep this file current as work progresses.
