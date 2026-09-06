# Session handoff

Last updated: 6 September 2026. Read this file and `review.md` before continuing.

## Current release

- Production: https://portal.getkoodos.com (also https://my-workspace-beta-jet.vercel.app).
- Content delivery and real branding shipped in commit `e0111e3` on `main`.
- Publishing and navigation improvements shipped through PR #1:
  https://github.com/Koodos67/my-workspace/pull/1
- PR #1 merged as `5d51e6ff0eca5472e2b41f98fbed9c49cb2c2c11`.
- Vercel production deployment `dpl_dY53fvk3TF79hjMY4MGCjqZRiKnK` is Ready and aliased to the production portal.
- The user tests through production because their magic links return there. They explicitly requested the PR and merge to main for these changes.

## Completed this session

### Review and upload failure

- Read Claude's `review.md` and checked the findings against the implementation.
- Diagnosed the stalled upload from the saved Playwright trace: the Blob SDK calls `https://vercel.com/api/blob/`, which the portal CSP blocked. SDK retries left progress at 0%.
- Allowed that specific API path in CSP while preserving private storage and sandbox restrictions.
- Added 45-second UI deadlines for preparation, transfer and save, with stage-specific errors and an AbortController for the transfer.
- Server actions cannot be cancelled by the browser. A save timeout explains that it may still complete and asks the admin to refresh/check before retrying.
- Set the default development port and example auth URL to localhost:3198, matching the end-to-end suite.
- Expanded the dense item-edit SQL into readable lines without changing its behavior.
- Updated README delivery status and documented retention limitations.

### Branding

- Downloaded the user's original light SVG and preserved its vector geometry.
- Added `public/brand/koodos-logo-light.svg`, `koodos-logo-black.svg`, and `koodos-logo-teal.svg` (exact teal `#00f5d0`).
- Added the shared `BrandLogo` component; the current light UI uses black on the shell, login and not-found pages.

### Client visibility diagnosis

- Read-only production inspection found the two Rooted items were drafts: the HTML proposal and the DLT roofing example link.
- Both were in Proposal Artifacts at inspection time, including the link intended for the workspace root.
- Confirmed that the registered test member has active Rooted membership; the email supplied in chat contained a typo.
- Explained how to publish and move the link. Did not change the real items, membership or publication state during diagnosis.

### Publishing and navigation UX (PR #1)

- Added a highlighted Client visibility panel grouping the Share with client checkbox, explanatory copy and save action.
- Button labels reflect the intended action: Save draft, Save & publish, Save changes, Save & unpublish.
- Item summaries explicitly say Draft / hidden from client or Published / visible to client, with an Edit & sharing cue.
- Added guidance about publishing after creating content.
- Replaced subtle return links with labelled back buttons, generous targets and visible hover/focus states.
- Admin previews return to management; client item views return to their workspace and folder anchor.
- Added Back to all workspaces. `/workspaces?all=1` opens the chooser even for a single-workspace member, avoiding a redirect loop.
- Added matching back navigation to the client design preview.

## Verification

- Production build and TypeScript checks passed after the latest UI changes.
- Expanded development end-to-end suite passed (about 1.4 minutes), including real transfer timeout and retry, draft invisibility, publishing, unpublishing, sandbox script execution/isolation, private signed delivery, version pinning, cross-client denial, folder archive/restore, membership revocation and admin/client back navigation.
- Desktop and mobile screenshots reviewed, including the publication panel and back buttons; mobile overflow assertion passed.
- Vercel PR checks passed before merge; production reported Ready after merge.
- Live production login/logo checks passed for the branding release, including all three SVG assets and upload CSP.
- After PR #1, a live mobile browser check on `/preview/rooted-education` returned HTTP 200 and the new back button successfully opened `/preview`, with no page errors.
- Authenticated publishing behavior was verified with development fixtures, not by modifying real production client content.
- Temporary scripts/screenshots live in ignored `.shipstudio/`; no secrets or generated browser artifacts are committed.

## Remaining work and constraints

- Keep new content as drafts until an admin explicitly publishes. Improve further only with evidence from use.
- Blob orphan cleanup and a permanent deletion/retention policy remain pending. Archive hides items; saved versions are retained.
- Comments and acknowledgements remain schema-only; inbox, exports and complete client branding controls are also pending.
- Automated real-email sign-in coverage remains pending. The existing integration tests forge session cookies and use the development database/Blob store.
- Do not blindly apply FORCE ROW LEVEL SECURITY: current security-definer helpers rely on privileged access to avoid policy recursion. A restricted runtime connection/role design requires separate investigation and tests.
- Do not simply randomize the artifact iframe nonce: srcdoc inherits the parent CSP. Preserve the opaque sandbox and verify inline execution and isolation if changing this design.
- No schema migration or real client-data mutation was made in this session.

## Environment notes

- Workspace: `C:/Users/marku/ShipStudio/my-workspace`.
- Use `npm.cmd` / `npx.cmd` in PowerShell because execution policy blocks the `.ps1` wrappers.
- `rg` and `agent-browser` are unavailable here; used PowerShell/Python searches and the installed Playwright browser tooling.
- Development server was already listening on localhost:3198; do not start a competing Next.js process.
- Sandbox network restrictions require elevated execution for development DB tests and deployment commands.
- Elevated Git runs as a different Windows user and needs the per-command option `-c safe.directory=C:/Users/marku/ShipStudio/my-workspace`. No global trust configuration was changed.
- The Vercel connector returned 403 for this project; authenticated `npx.cmd --yes vercel ...` worked.
- `.agents/` contains pre-existing local skills and was deliberately left outside app commits. Next.js may rewrite `next-env.d.ts` between dev and production builds; avoid committing incidental generated-path changes.

## Next session

Start with the user's production feedback on publishing and navigation. The latest application release is already live; no outstanding deployment approval is needed for that release. Keep this file current as work progresses.
