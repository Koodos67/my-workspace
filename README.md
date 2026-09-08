# KOODOS Client Workspace

Latest work, release status and remaining tasks: [session handoff](docs/SESSION-HANDOFF.md).

Clients contain projects. Each project owns its work tracks, folders, documents,
links and approval requests. Membership and branding remain at client level;
members can see every active project for their client. Select a project in the
client workspace; its address uses `?project=<id>`.

Apply `006_projects.sql` before running the project-aware application. It places
existing client content in a renameable **Main project**, preserving item URLs,
versions, timestamps and approval history. New clients receive the same initial
project, and each new project receives its own seven standard tracks. Archiving a
project hides its contents from members; restoring it restores publication visibility.
Cross-project moves are not supported in this version.

Run `npm run test:projects` for project ownership and access checks, and
`npx playwright test tests/projects.spec.ts` for the multi-project browser workflow.
The development-only migration runner `npx tsx scripts/migrate-projects.ts`
rehearses and rolls back; `--apply` applies the migration to development only.

Next.js App Router, TypeScript, Tailwind, Neon Postgres, Better Auth, and Resend.
Vercel project: mark-thurman-s-projects/my-workspace.
Neon: my-workspace-db, free plan, London, connected to development only.

## Local setup

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` only on a fresh checkout. Never overwrite existing secrets.
3. Set DATABASE_URL, BETTER_AUTH_SECRET (random, at least 32 bytes), BETTER_AUTH_URL,
   RESEND_API_KEY, EMAIL_FROM, and ADMIN_EMAIL.
4. Run `npm run db:migrate` against an empty dedicated Neon database.
5. Run `npm run db:seed-admin` to prepare the chosen admin. It sends no email.
6. Run `npm run dev`, then open http://localhost:3198/login. Set BETTER_AUTH_URL to
   that same origin. The end-to-end tests use this port by default too.

Use `npm run test:rls` to verify database access in a transaction that is always rolled back.
Use `npm run build` for production compilation and type checking.

The user-provided Resend key lives only in ignored .env.local. EMAIL_FROM must use
a verified Resend sending domain. Request a login link from the login screen.

## Routes

- /login — invite-only email magic links
- /admin — create clients and list active workspaces
- /admin/board — cross-client delivery reporting, live-work filters and ongoing services
- /admin/clients/[id] — folders, keyboard reorder, invitations, access revocation, archive
- /workspaces — role routing and client chooser
- /c/[slug] — authenticated client workspace and folders
- Client workspaces include six delivery stages and a separate ongoing-service panel.
- /preview — clearly labelled design preview with sample content

## Security foundation

Better Auth owns sessions and verification tokens. Magic links expire after 15 minutes,
are hashed in Postgres, and are single-use. Sessions last 30 days. Public signup is
disabled, and the delivery callback suppresses email for unknown or inactive members.
Authentication endpoints use a database-backed rate limit.

All application data queries run through withActor(), which opens a transaction,
switches to the restricted koodos_app role, and sets the session-derived identity
with SET LOCAL. Postgres RLS enforces membership, draft visibility, and archive rules.
The restricted role cannot read auth tables or change profiles. The owner connection
is reserved for Better Auth, explicit admin-only identity provisioning, and setup.
Do not introduce direct owner-pool queries in regular application pages.

Membership removal immediately hides client data even while a session remains valid.
The admin role is set by the explicit seed script; submitted user metadata cannot set it.

Uploaded files use private Vercel Blob storage, 60-second signed URLs, and
opaque-origin sandboxed frames. The portal CSP permits the Blob upload API as well
as storage hosts. Upload preparation, transfer and save each have a 45-second UI
deadline; a timed-out transfer is aborted. Server actions cannot be cancelled by
the browser, so a save timeout asks the admin to refresh and check before retrying.
Do not serve uploaded HTML from the application origin.

## Delivery status

Foundation schema applied and admin seeded. Admin client/folder management, folder
reordering, invitation resend, artifact/file upload, immutable versions, draft/publish,
private delivery, sandboxed interactive previews and real client item cards are implemented.
The content-delivery end-to-end test covers these delivery boundaries and access
revocation. It uses temporary fixtures in the development database and Blob store;
it does not verify real email sign-in.
Still pending: real email sign-in verification, complete client branding controls,
comments, acknowledgements, inbox and exports. Comments and acknowledgements are
schema foundations only, without a write path or UI.

Work tracks are implemented: editable standard stages, client-facing status notes,
folder assignment, derived published-deliverable counts, and an admin board. Apply
`004_tracks.sql` before deploying this release. It seeds seven tracks for existing
clients without inferring their progress or assigning their folders; new clients
receive the same defaults in the client-creation transaction. Status and note changes
appear to clients immediately. Archiving a track hides its reporting only.

`tests/tracks.spec.ts` verifies the reporting workflow and responsive views with temporary
development fixtures. `test:rls` explicitly loads development settings and refuses the
production database.

Plan and Launch checkpoints support explicit approval requests, client approval or requests
for changes, and immutable response history. Plan requests pin an uploaded document version;
Launch requests capture a staging release and the planned launch/DNS scope. Approval records
permission and leaves track status and launch operations under manual control. Apply migration
`005_approvals.sql` before deploying this feature. Run `npm run test:approvals` for database
permission/record tests and `tests/approvals.spec.ts` for the browser workflow.

Archive currently hides an item; it does not permanently delete its files or version
history. All saved versions are retained. Abandoned uploads can leave unreferenced
blobs; automated orphan cleanup and a permanent-deletion/retention policy remain pending.

Run `npm run test:e2e` with the local server running. The suite checks private upload,
timeout recovery and retry, draft visibility, sandbox isolation, publishing, version
pinning, cross-client denial, folder archive/restore and membership revocation.

The original Supabase migration is retained under docs/archive for historical reference
only. Never run it against Neon. The active migrations are in database/migrations.

Before deploying content delivery, verify the separate database environment, auth URL
and private Blob configuration for the chosen hosted domain.
Production is configured at https://my-workspace-beta-jet.vercel.app with a separate free Neon database (my-workspace-prod-db, London). Production credentials live in Vercel environment variables; local development continues to use my-workspace-db. GitHub main is connected to the Vercel production project.

