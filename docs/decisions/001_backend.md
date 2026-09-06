# Backend decision — 2026-09-05

The user approved replacing Supabase after an egress limit blocked development.
Use Neon Postgres through Vercel (free plan), the open-source Better Auth framework,
Resend, and private Vercel Blob (M2). Existing Vercel Pro hosting is retained.

The PRD's data model, invite-only access, 30-day sessions, client isolation,
private artifact delivery, and exportability remain requirements. Supabase-specific
APIs and auth.uid() policies are superseded by session identity passed into a
restricted Postgres transaction. Raw owner credentials never reach the browser.

Current project: my-workspace. Admin: mark@getkoodos.com.
Email sender: workspace@getkoodos.com.
No paid Neon plan or Better Auth managed service is required.
