# KOODOS Client Workspace

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
6. Run `npm run dev`, then open http://localhost:3000/login.

Use `npm run test:rls` to verify database access in a transaction that is always rolled back.
Use `npm run build` for production compilation and type checking.

The user-provided Resend key lives only in ignored .env.local. EMAIL_FROM must use
a verified Resend sending domain. Request a login link from the login screen.

## Routes

- /login — invite-only email magic links
- /admin — create clients and list active workspaces
- /admin/clients/[id] — folders, keyboard reorder, invitations, access revocation, archive
- /workspaces — role routing and client chooser
- /c/[slug] — authenticated client workspace and folders
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

Uploaded files are not implemented yet. CSP currently denies all frames. M2 will add
private Vercel Blob storage, 60-second signed URLs, and opaque-origin sandboxed frames.
Do not serve uploaded HTML from the application origin.

## Delivery status

Foundation schema applied and admin seeded. Admin client/folder structure implemented.
Still pending: end-to-end real email sign-in, drag-and-drop ordering, complete client
branding/edit controls, invitation resend/status, artifact upload/versioning, client
item cards from real data, comments, acknowledgements, inbox, exports, deployment.

The original Supabase migration is retained under docs/archive for historical reference
only. Never run it against Neon. The active migrations are in database/migrations.

Before deployment, connect a separate database environment, set the auth URL to the
chosen hosted domain, and provision private Blob when building artifact delivery.
Production is configured at https://my-workspace-beta-jet.vercel.app with a separate free Neon database (my-workspace-prod-db, London). Production credentials live in Vercel environment variables; local development continues to use my-workspace-db. GitHub main is connected to the Vercel production project.

