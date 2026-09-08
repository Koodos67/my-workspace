# Session handoff

Last updated: 8 September 2026. Read this file before continuing. It is the single
running record for this project; the earlier standalone `review.md` has been folded
in here and deleted.

## Standard folders per project — Claude Opus 5, 8 September 2026

The user decided every project should arrive with folders named after the delivery stages, plus
one for the commercial paperwork, instead of an empty filing area.

- `seedProject` (`src/lib/project-setup.ts`) now seeds both tracks and folders, and is called from
  `createClient` and `createProject`. `seedTracks` returns the rows it inserted, because each
  folder is **linked to its stage** via `folders.track_id` — so the client progress spine links
  from a stage straight to its folder with no manual wiring.
- Folders: Discovery, Research, Plan, Build, Review, Launch, then `Proposals & commercials`
  (`EXTRA_FOLDERS`). **Operate is excluded on purpose** — ongoing service is not a filing stage.
  They are ordinary folders once created: rename, reorder, archive or reassign freely.
- Two consequences that had to be handled, not just the seeding itself:
  - **The client view now hides empty folders.** Seeding means most folders are empty most of the
    time, and the client page previously rendered a section per folder — a brand-new workspace
    would have shown seven "your shared work will appear here" blocks. Filing structure is the
    studio's business; the client sees only folders holding published work.
  - **Two suites encoded "a new client has no folders."** `tracks.spec` took `rows[0]` from an
    unordered folder query, which silently became a seeded folder; it now names the folder the
    test made. `content-delivery.spec` clicked "Archive" unscoped inside `#folders`, which became
    a strict-mode violation with eight rows; it now scopes to the Reports row. Both are faithful
    to what those tests were checking.
- Existing projects are **not** backfilled. Where a project has no folders at all, the Folders
  panel offers `addStandardFolders`, which refuses if any folder exists so it cannot duplicate,
  and mirrors the project's current stage names rather than the shipped defaults.

Verified: typecheck, production build, `test:rls`, `test:projects` and all five browser suites.

## Client comments — Claude Opus 5, 8 September 2026

The user chose this as the next feature. Outside the two approval checkpoints a client had no way
to say anything at all, and the `comments` table had existed since migration 002 with a read
policy and no way to write to it. This opens it.

### Working practice the user set on 8 September

The user works **primarily against production**, migrations included, and asked me to do the same:
magic-link sign-in only returns to production, the ShipStudio preview cannot hold an authenticated
session, and the development database holds no clients. No clients have access to production yet.
He will move to stricter rehearse-then-release discipline before clients are in the mix. Until
then, do not gate ordinary work behind development-only rehearsal — but still say plainly when
something touches production and still run the suites first.

### `npm run db:migrate` used to target production silently

Found while applying this migration and worth knowing: `scripts/migrate.ts` called
`loadEnvConfig(process.cwd())`, which **defaults to production**. Every test script in this repo
passes the explicit development flag and refuses a production host; the migrate script did not, so
`npm run db:migrate` on a developer's machine applied migrations to production with nothing said
about it — including for the README's documented "run it against an empty dedicated Neon database"
setup step. It now defaults to development, prints its target host either way, and requires
`--production --yes` to touch production. Nothing automated depended on the old default.

### Schema — migration 007

- The runtime role keeps **SELECT only** on `comments`; `private.post_comment`,
  `private.edit_comment` and `private.delete_comment` are security-definer with empty
  `search_path` and take the author from `private.actor_id()`. A submitted profile id is never
  trusted. This is the approvals pattern, unchanged.
- `private.can_comment_on_item` gates writing: the item must be published, unarchived, in a live
  folder, in an unarchived project, for an active client the actor can access. **An admin cannot
  comment on a draft**, so an internal note can never appear to the client the moment it is
  published.
- **`author_name` and `author_role` are snapshotted onto each comment.** This is not redundancy:
  `profiles_read` lets a client member read only their own profile, so joining for an author name
  would leave every other participant anonymous to them. Approvals snapshot the responder for the
  same reason. A later rename does not rewrite old comments.
- Authors edit their own comments only — an admin can remove one but never rewrite it. Removal is
  a soft delete; the pre-existing `comments_read` policy from 002 keeps removed rows visible to
  admins, and the admin UI says so on the row rather than hiding the fact.
- Migration 007 is additive. Production's `comments` table was confirmed empty before applying,
  which is what makes the `set not null` safe. LF line endings pinned in `.gitattributes`.

### Interface

- `CommentThread` on `/items/[id]`: KOODOS and the client are told apart by tint, avatar and a
  role label. Removed comments show as withdrawn to admins, not silently dropped.
- Counts where they answer a question: the client's item card shows a conversation exists; the
  admin content row shows **"client replied"** in amber, which is the only version of that fact
  the studio needs, and links straight to `#comments`.
- `CommentComposer` is the one client component here, because the box must empty after posting.

### A bug worth not repeating

The composer initially had no hydration guard. Before React hydrated, submitting did a **native
GET** and the comment went into the query string and was lost, silently. The board and the
approval response already guard with a `ready` state; the composer now does too. This cost several
runs to find because the page looked correct and no error appeared anywhere — the tell was that
the click produced `GET /items/…?body=…` and no POST at all.

### Verification

Typecheck, production build, `test:rls`, `test:projects` and all five browser suites pass,
including the new `tests/comments.spec.ts` and the 390px overflow assertion. The new suite covers
posting, the box emptying, a second member seeing the author's name without profile access, a
stranger seeing nothing, the admin flag and reply, author-only editing with `edited_at`, removal
being a withdrawal rather than an erasure, project archive closing the thread, and revocation
removing it.

### Not done, deliberately

- **Acknowledgements are still schema-only.** That table now overlaps heavily with approvals,
  which are richer and already shipped. Worth deciding whether to build or drop it rather than
  leaving it as a third half-feature.
- No notifications of any kind, matching approvals. There is no unread state — an admin sees that
  a client replied, not which comments are new. A read marker would need a new table.
- Comments are per item. There is no project-level or track-level discussion.

## Project selector fixes — Claude Opus 5, 8 September 2026

Two admin problems the user hit on the shipped projects feature. Presentation and a client-side
reconciliation bug; no schema, server action, RLS or approval change.

### The projects panel duplicated itself on every switch

Clicking between project chips stacked another whole Projects card, growing without limit.
Reproduced with a temporary spec before touching anything, which is what identified it:

- Panels grew **only when returning to an already-visited `?project=` URL** — 1, 1, 2, 3 across
  three switches. A hard reload always returned 1, so nothing was wrong server side.
- `TrackManager` never duplicated, so it was not general to the page.
- Cause: `<ProjectNavigation key={project.id}>` sat directly in the page's own child list. On a
  soft navigation the client router replays the cached RSC payload for that URL, and a component
  whose key changed cannot be matched against the cached copy, so it is appended rather than
  replaced. The client view never had the key, which is why only the admin view was affected.
- Fix: the key is gone from the page. It existed to reseed the Project settings form's
  uncontrolled `defaultValue`s when switching project, so that reset now lives inside the
  component as `<ActionForm key={selected.id}>`, where it resets the fields without taking part
  in the page-level reconciliation. Verified 1 panel across every switch and after reload.
- **Do not put a changing `key` on a component in a page's child list** when the only thing
  varying is a search param. Key something inside it instead. The sibling
  `<div key={project.id}>` wrapping the rest of the admin content is a host element and does not
  show the behaviour; it was left alone and re-verified.

### The selected project was invisible from the work tracks

The selector sits at the top of a long page, so by the time an admin was editing a track there
was nothing on screen naming the project being changed.

- New `src/components/project-scope.tsx`: a small chip naming the project, with an `sr-only`
  "Project:" prefix so the heading reads correctly aloud.
- It appears on exactly the project-scoped sections — Work tracks, Add content, Project content,
  Folders. Its **absence on Members and Workspace settings is deliberate and meaningful**: those
  are client-wide. Do not add it there.
- `TrackManager` gained a `projectName` prop. The projects panel itself was given more visual
  weight than the sections it contains, since it is their parent.

Verified: typecheck, production build, `test:projects`, `test:rls` and all four browser suites
pass unmodified, including the 390px overflow assertion. Temporary spec deleted and its
development rows removed; leftover counts confirmed zero.

Shipped through PR #12, merged to `main` as `7f1f3b0`, production deployment Ready and
confirmed correct by the user on production.

### A branch push is only ever a Preview deployment

Worth stating plainly, because it cost a round trip. The user retested after a branch push, saw
the old behaviour, and reasonably concluded the fix had not worked. It had — the push produced a
**Preview** deployment; production only rebuilds on a merge to `main`. When a fix is reported as
still broken, check `git merge-base --is-ancestor <commit> origin/main` before re-diagnosing the
code. The development database has **no clients**, so any screenshot containing real client data
is production by definition — that is the fastest way to tell where the user is looking.
After a deploy, an open admin tab still holds the previous payloads in the router cache; a hard
refresh is needed to see the change.

## Projects under clients - 8 September 2026

The user needs several projects per client, each owning its work tracks, folders,
documents/links and approvals. Implemented on `feat/client-projects` on top of Claude's style pass;
the style changes are preserved. This section supersedes earlier client-only ownership.

- Client membership and branding stay at client level. Members see all active projects
  for their client; separate project membership is not implemented. This is the stated
  default for this cut; the optional access question has not received a different choice.
- Both admin and client pages have a project selector using `?project=<uuid>`. No query
  means the first active project. Unknown, cross-client or archived selections return 404.
  Existing client and item URLs continue to work, and item back links retain the project.
- Admins can create, rename, describe, archive and restore projects. Every new client
  gets a Main project; each new project gets the seven standard work tracks. Members,
  client branding and client archive controls remain below the project content.
- The studio board labels both client and project, including accessible status/drag
  names, and links to the correct project/track. The client directory counts active projects.
- Migration `006_projects.sql` creates projects and gives tracks, folders, items and
  approval requests non-null project ownership. Composite FKs reject cross-project
  folder/track, item/folder and approval/source associations, even within one client.
- Backfill creates one renameable Main project per existing client, preserving IDs,
  timestamps, file/version paths and approval snapshots. Item update/invalidation
  triggers are suspended only for this transactional backfill and restored immediately.
- Ownership cannot be reassigned through normal child updates. Cross-project content
  moves are not implemented. Legacy callers may omit a project only when exactly one
  active project exists; ambiguous inserts fail. New UI uploads sign the project in
  their receipt and recheck it when saving, including replacement uploads.
- Project archive hides its tracks, folders, items, versions and approvals from members
  through RLS, and blocks content changes and approval requests/responses. Restore
  restores previous publication/approval state; records and Blob files are retained.
  Client archive/revocation still remove access across every project.
- Migration 006 was rehearsed against development and production, then applied to both
  after the user authorised release. Production had two clients; it now has two Main
  projects and all existing records were unchanged. Its LF line endings are pinned in
  `.gitattributes` for checksum consistency.
- PR #11 was pushed and merged to `main` as `759bf5553e62cdb658c4bdd9e5c81995abce8799`.
  The production deployment is Ready at `dpl_45Ua7UfhJy3sE7uVw75nQiv8anqN`, with
  `portal.getkoodos.com` and the existing Vercel aliases pointing to it.
- The production migration and deployment were explicitly authorised by the user on
  8 September 2026. Future schema migrations still require the same rehearsal/release
  discipline. The local `.shipstudio/PR-PROJECTS.md` remains a release summary.
- `scripts/migrate-projects.ts` is a development-only runner: default rehearses in a
  rolled-back transaction, `--apply` applies. The rehearsal was run before application
  with legacy folders, a versioned artifact and an approved launch request; all existing
  values were preserved. The real development database contained no clients at application.
- Verification: production build, `test:projects`, `test:approvals`, `test:rls`
  and all four browser suites passed. Desktop/390px screenshots reviewed. The final targeted
  browser rerun passed for second-project upload/approval and selector spacing changes.
  `tests/projects.spec.ts` uses temporary development rows and removes its Blob uploads.
- New core files: `src/lib/projects.ts`, `src/app/admin/project-actions.ts`,
  `src/components/project-navigation.tsx`, migration 006 and the project test/migration scripts.
  Existing actions/queries now scope creation, ordering, reading and approvals to a project.

## Style handoff to Claude Opus 5 - 7 September 2026

The user took over with Claude Opus 5 to make style changes, logged for the next Codex
session. This section records the brief; the completed work is in "Style pass one" below.
The release details further down describe the pre-style baseline.

- Log the affected screens/files, visual decisions, checks and outstanding issues
  here as the style work progresses, including whether it is local, committed or deployed.
- Returning Codex sessions must read the style logs, recent commits and working-tree
  diff before editing. Treat the resulting styling as the new baseline and preserve
  it when continuing feature work; earlier design approvals are historical context.
- Keep existing authentication, tenant isolation, private artifact sandboxing,
  publishing and approval behavior intact during the style pass.
- Record any intentional behavior changes separately so the next session can tell
  them apart from presentation changes. Do not assume old test results validate new edits.

## Style pass one — Claude Opus 5, 7 September 2026 (work tracks and approvals)

The user asked for three things in one PR: differentiate work tracks in the admin client view
(especially done and not-started), improve the layout inside a track with approvals in mind and
tooltips where suitable, and take the same approach to the client view. All of it is presentation
and copy. **No schema change, no server action changed, no change to auth, RLS, publication
filtering, artifact sandboxing or the approval state machine.** Treat this styling as the baseline.

### Affected files

- New: `src/components/hint.tsx` (tooltip), `src/components/stage-progress.tsx` (segment strip).
- Rewritten: `src/components/track-manager.tsx`, `src/components/client-progress.tsx`,
  `src/components/approval-card.tsx`, `src/components/approval-manager.tsx`,
  `src/components/approval-response.tsx`.
- `src/lib/tracks.ts` gained presentation helpers only: `STATUS_TONE`, `statusHelp`, `daysSince`,
  `sinceLabel`, `currentStageIndex`. No existing export changed.
- `src/app/globals.css` gained one commented section at the end; the dead `.track-number` rule was
  removed. Nothing else in the file was rewritten.

### Design decisions

- **One status vocabulary across both views.** A status decides a row's marker shape, its left
  accent colour and how much the row recedes. Colour is never the only signal: done is a filled
  green circle with a tick, not started is a dashed hollow ring on a dashed row, live work is a
  solid ring on a white row. This is what separates done from not-started at a glance, which was
  the specific complaint.
- **A segment strip** (`StageProgress`) at the top of both views: one segment per delivery stage,
  coloured by status, so the shape of a project reads before any row is opened.
- **A connector rail** behind the admin stage rows, visible only in the gaps, so stages read as a
  sequence rather than a flat list. The client spine's connector turns green under finished
  stages so the eye follows the coloured run to where work actually is.
- **Current versus up next.** The highlighted stage is flagged `Current` only when it has actually
  started; otherwise it reads `Up next`, and the overview says "Up next" rather than "Now on".
  A "Status changed …" line is suppressed on not-started stages, where seeding made it misleading.
- **The track editor is zoned, not collapsed.** One form and one `updateTrack` action as before,
  split visually into *Reporting · your client sees this* (status, client update, plus a line
  showing the client-facing label, which differs from the admin one), *Stage setup*, and
  *Approval checkpoint*, with the save button in a footer. It stays a single form deliberately —
  and no `<details>` was added inside a track editor, because `tests/tracks.spec.ts:130` does
  `research.locator('summary')` and a second summary there is a strict-mode violation.
- **Approvals lead with what to do next.** The admin panel shows a state strip in plain words
  ("Waiting on the client…", "A fresh request is needed…"). The card gained a facts grid
  (deliverable, version), a button-styled review link, and, for a client with a decision to make,
  an amber prompt and a highlighted stage in the spine with a "Your decision needed" chip and a
  jump link from the banner at the top.
- **A real duplication was removed.** The consent sentence was previously rendered both as the
  card's authority line and as the checkbox label. It is now shown only when no response form is
  present, so the reader parses that sentence once.
- **Tooltips are `Hint`, not `title`.** Click toggles (touch), hover reveals (mouse),
  `aria-describedby` carries the text to assistive technology, Escape and outside press close it.
  They are used only where a consequence needs explaining: status meanings, what the client sees,
  what plan versus launch approval does, what responding commits to.

### Two traps worth knowing before editing these files again

- **A hint button must sit outside its `<label>`.** A control nested in a label inherits that
  label, so an icon button inside one starts answering to the field's accessible name and
  `getByLabel('Client update')` resolves to the button. Hence the `.field` / `.field-label`
  pattern rather than the plain `<label>` wrapper used elsewhere.
- **A hidden tooltip must be `display:none`, not `visibility:hidden`.** A laid-out absolutely
  positioned bubble widens the document's scroll area and fails the 390px overflow assertion in
  all three suites. Hidden elements referenced by `aria-describedby` still supply their text.

### Verification

- TypeScript, the production build, and all three browser suites pass
  (`approvals`, `content-delivery`, `tracks`), including their 390px horizontal-overflow
  assertions and the "no page errors" checks. No test file was modified.
- Element-scoped screenshots of the redesigned surfaces were captured from a temporary spec at
  1280px and 390px and reviewed with the user, who approved them. That spec was deleted and its
  development-database rows were removed; the leftover client and users are gone, confirmed by
  count. Note the teardown order that circular foreign keys require: approval requests, then
  `items.current_version_id` to null, then item versions, then items.

### Status and what is not done

- Shipped through PR #10, merged to `main` as `88a8463`, and deployed to production automatically.
- The admin board (`/admin/board`) was deliberately left alone: it was not in scope and its
  cards already differentiate by column. It now shares the status hues, so it stays coherent.
- Performance optimisation remains deferred at the user's request. No dark mode work was done;
  the app is a single committed light theme.

## Current release

- Standard project folders shipped through PR #14, merged to `main` as `40017ea`, production
  deployment Ready. No migration; existing projects are untouched and can adopt the set from the
  Folders panel when they have none.
- Client comments shipped through PR #13, merged to `main` as `a251b9c`, production deployment
  Ready. Migration 007 was applied to production before the code reached it.
- The project selector fixes shipped through PR #12, merged as `7f1f3b0`, and were confirmed
  correct on production by the user.
- Projects under clients shipped through PR #11, merged as `759bf55`, with migration 006 applied
  to development and production.
- The work-track and approval style pass shipped through PR #10, merged to main as `88a8463`,
  and is live on production. Presentation and copy only — no migration, no server action change,
  and no change to auth, RLS, publication filtering, artifact sandboxing or approval behaviour.
  Typecheck, production build and all three browser suites passed unmodified before the merge.
- Plan and Launch approvals shipped through PR #9, merged to main as `8f2efcb`.
  Migration 005 is applied in production; approval, tenant-isolation, content-delivery,
  and work-track checks passed, together with typecheck and production build.
- Work tracks, client progress and the admin board shipped through PR #8, merged to main
  as `e506464`. Migration 004 is applied in production (14 tracks across two clients).
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

## Plan and Launch approvals — implemented 7 September

The user approved adding two explicit checkpoints: approval of a specific Plan deliverable
before Build, and permission to launch including DNS changes and switching traffic. Launch
approval is before going live, not retrospective acceptance. The user approved the tracks UI
and asked to defer performance optimisation until more features are in place.

- Admins explicitly request approval from the Plan/Launch track, choosing published content,
  a version/release label and scope. Plan requires an uploaded versioned document or artifact.
  Launch can reference a published staging link or uploaded launch document. A link requires
  a fixed preview URL or release reference; external site changes cannot be detected by the
  portal, so the admin must request fresh consent when that site changes.
- Migration 005 adds explicit tracks.approval_kind and enables it for existing tracks named
  Plan/Launch. New-client defaults seed these flags. Renaming does not change the flag, and
  admins can configure it for renamed/custom stages through the track form.
- Each request snapshots the file version, source title/URL, release label, scope and approval
  wording. The client reviews a link pinned to the requested uploaded version.
- Active client members can approve or request changes with an optional comment. Approval
  requires an explicit checkbox; the first response closes the request. No designated approver
  roles in this cut. Admins cannot approve on behalf of clients.
- Name, email, profile identity, decision, comment and timestamp are recorded from trusted
  database/session data. The application role has SELECT only on approval_requests. Narrow
  security-definer functions with empty search_path perform the validated mutations.
- Request/response snapshots cannot be edited or deleted through the application role.
  Withdrawals and new requests retain history; new requests supersede earlier permission.
  Replacing a file version or editing a staging link permanently invalidates its old request.
  Archived, unpublished, changed or inaccessible sources cannot be approved.
- Client and admin views show receipts, stale requests and earlier history. Pending requests
  are called out above the client spine; admin track summaries show approval status.
- Approval is evidence of permission, separate from manual track status reporting. It does
  not automatically start Build, complete Launch, deploy anything or change DNS. No email
  notifications or reminders have been added.
- Browser testing found clock skew in a JavaScript publication-date check. Approval source
  eligibility now uses the same database clock as publishing/RLS. Approval receipts stay
  expanded after a response so clients immediately see the recorded result.
- Tests: test:approvals covers immutable records, tenant isolation, client-only responses,
  source validation, response ownership, superseding, replacement invalidation, withdrawal
  and revocation in a rolled-back development transaction. The approvals browser suite covers
  a real uploaded Plan version, pinned review, consent validation, recorded identity/comment,
  replacement, changes requested, explicit DNS scope, stale-tab withdrawal and mobile views.
  Existing content-delivery and work-tracks suites pass. Screenshots reviewed at desktop/390px.
- Final verification: all three browser suites, test:approvals, test:rls and the production
  build pass. Migration 005 was rehearsed and rolled back against production, then applied:
  two Plan and two Launch checkpoints enabled. No requests or responses were created for
  real clients. The migration's LF line endings are pinned for checksum consistency.

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
- **Comments shipped on 8 September** (migration 007, PR #13). **Acknowledgements are still
  schema-only** — the table has a read policy, no INSERT grant and no UI, and it now overlaps
  heavily with approvals, which are richer and already shipped. Decide whether to build it or drop
  the table rather than leaving a third half-feature in the schema.
- Comments have **no unread state**: an admin sees that a client replied, not which comments are
  new since they last looked. That needs a per-profile read marker, i.e. a new table. There are no
  notifications of any kind, matching approvals. Comments are per item; there is no project- or
  track-level discussion.
- **Per-project access is an open decision.** Every client member currently sees every active
  project for their client, which is the stated default for the projects cut and has never been
  confirmed against a real preference. Cheaper to settle while there are two projects than twenty.
- Inbox, exports and complete client branding controls are also pending.
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
- **The user works primarily against production, deliberately** (stated 8 September 2026).
  Magic-link sign-in only returns there, the ShipStudio preview cannot hold an authenticated
  session, and the development database holds no clients — so production is the only place an
  authenticated flow can be tested. No clients have access yet; he will move to stricter
  rehearse-then-release discipline before they do. Until then do not gate ordinary work behind
  development-only rehearsal, but always say plainly when something touches production, and run
  the suites first.
- **A branch push is only ever a Preview deployment.** `portal.getkoodos.com` rebuilds only on a
  merge to `main`. This cost a full round trip on 8 September: a fix was pushed to a branch, the
  user retested production, saw the old behaviour and reasonably concluded the fix had failed. If
  something is reported as still broken, run
  `git merge-base --is-ancestor <commit> origin/main` before re-diagnosing the code. Any screenshot
  containing real client data is production by definition. After a deploy an open tab still holds
  the previous payloads in the router cache, so a hard refresh is needed.
- **`npm run db:migrate` now defaults to the development database.** It previously called
  `loadEnvConfig(process.cwd())`, which defaults to *production*, so the documented setup command
  silently migrated production from a developer's machine. It now prints its target host every
  run and requires `--production --yes` to touch production.
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

Everything below the "Current release" list is shipped, merged and live on production as of
8 September 2026. Read the release status and the environment notes before changing code or
deploying — particularly the production-first working practice and the preview-only branch push.

1. **Preserve what is there.** The style pass is the visual baseline, the project hierarchy is the
   data model, and both are load-bearing. Do not restore an older layout to match older session
   notes, and do not reassign project ownership through child updates.
2. **Collect production feedback** on the things that have never met real client behaviour: Plan
   and Launch approval requests, the new comment threads, whether the stage differentiation reads
   correctly with real data, and whether the seeded folders match how the studio actually files.
3. **Three decisions are open and named** in "Remaining work and constraints": acknowledgements
   (build or drop the table), per-project member access, and the Blob retention/deletion policy.
   The retention one gets more expensive the longer it waits.
4. The older admin layout and HTML rendering are approved; do not ask for that approval again.
   Subsequent user-directed style changes supersede the older visual baseline.
5. Individual tasks remain future work; performance optimisation is deliberately deferred at the
   user's request.

No open design questions block the next piece of work. Keep this file current as work progresses.
