# PRD — KOODOS Client Workspace (interim PM tool)

**Owner:** Mark Thurman, KOODOS
**Status:** Draft for build
**Build target:** ShipStudio + Claude Opus 5, deployed to Vercel
**Version:** 1.0

---

## 1. Summary

A two-level client delivery portal. At the top level, KOODOS (a single admin) creates client companies, organises their deliverables into folders, and uploads self-contained HTML artifacts. At the client level, an invited contact signs in with a magic link and sees only their own workspace: a clean dashboard of folders and items, each opening into a rendered artifact they can read, comment on, and where required, formally acknowledge.

The immediate job is replacing ad-hoc delivery of HTML artifacts by email and link with a single durable, access-controlled home per client. The eventual job is task tracking: a client-facing view of their own work in progress, and an admin kanban spanning every client.

This tool may later be superseded by the larger KOODOS portal programme. The build posture is nonetheless **foundation, not throwaway**: the data model, auth model and storage layout below are designed so that tasks and kanban drop in without migration pain, and so that everything can be exported cleanly if it is replaced.

---

## 2. Goals and non-goals

### Goals

1. One authenticated place per client where every deliverable lives, organised the way KOODOS thinks about the work.
2. Upload an HTML artifact by drag and drop and have it live and shareable-in-portal in under thirty seconds.
3. Artifacts render as first-class documents, not as file downloads, without exposing them publicly.
4. Overwriting an artifact with an updated version does not change its address or break anything.
5. A client can respond to a deliverable — a comment, or a recorded approval — without email.
6. A schema that grows into tasks and kanban rather than being rebuilt for them.

### Non-goals for v1

- Payments, invoicing, or invoice status.
- Proposal acceptance flows and contract signature (separate parked programme).
- Client-initiated uploads.
- Any client-visible view of other clients, or admin sharing between clients.
- Tasks and kanban (v2 — see §11).
- Multi-admin, agencies, or team roles.
- Notifications beyond transactional email.

---

## 3. Users

| Role | Who | Access |
|---|---|---|
| **Admin** | Mark (single user for the foreseeable future) | Everything. All clients, all items, admin console. |
| **Client user** | An invited contact at a client company, e.g. Heather Weaver at Rooted Education | Their own client workspace only. Read items, comment, acknowledge. |

A client company may have several client users. In practice most will have one. The schema supports many from day one because retrofitting membership onto a single-contact model is expensive and this is exactly what happens when a second stakeholder appears mid-project.

---

## 4. Information architecture

```
Client (company)
└── Folder            e.g. "Proposals", "SEO Research", "Content Gap Analysis"
    └── Item          an artifact, a link, or a file
```

- Folders are **one level deep** in v1. The schema carries a nullable `parent_id` so nesting can be enabled later without migration, but the UI and validation enforce depth 1.
- Items may sit directly at the client root, outside any folder. Useful for a "Start here" welcome artifact.
- Folders and items are manually ordered by drag, not sorted by date. Ordering is editorial — it is how KOODOS presents the work.
- Everything is archived, never hard-deleted, in v1.

**Worked example — Rooted Education**

```
Rooted Education
├── (root) Welcome & how this works        [artifact]
├── Proposals
│   ├── Being Findable — can't wait        [artifact]
│   └── Interim presence proposal           [artifact, requires acknowledgement]
└── Design
    └── Design track comparison tool        [link → rooted-ashen.vercel.app]
```

---

## 5. Item types

| Type | Behaviour |
|---|---|
| `artifact` | A single self-contained `.html` file uploaded by the admin. Rendered inside the portal viewer. Versioned. This is the primary type. |
| `link` | An external URL. Opens in a new tab. For live apps, staging sites, shared Drive folders. |
| `file` | Any other uploaded file — PDF, image, zip. Downloads through the same auth-gated route. Previewed inline where the browser can (PDF, images). |

All three share the same item record, ordering, comments, and acknowledgement behaviour. Rich-text note items are out of scope; a note is just a short artifact.

---

## 6. Authentication and access control

### 6.1 Mechanism

Supabase Auth, email magic link (OTP), no passwords anywhere.

- Admin invites a client user by email from the admin console. The server creates the auth user with the service role (`auth.admin.inviteUserByEmail`) and inserts a `membership` row linking that user to the client.
- Sign-in calls `signInWithOtp` with **`shouldCreateUser: false`**. This is critical: without it, any email address can request a link and create an account. Only pre-invited addresses can ever receive a link.
- An unknown email gets the same neutral "check your inbox" response as a known one. No account enumeration.
- Magic links expire in 15 minutes and are single use. Sessions last 30 days with refresh.
- Admin identity is a `role = 'admin'` flag on the profile, not a separate auth system.

### 6.2 Authorisation

Postgres row-level security is the enforcement boundary, not application code. Every table with a `client_id` carries a policy of the form: the row is visible if the current user is an admin, or if a membership row exists linking the current user to that `client_id`. Application queries run with the user's own JWT; the service role key is used only in server actions that legitimately need to bypass RLS (invites, uploads, admin console).

This matters because it means a bug in a route handler cannot leak one client's items to another.

### 6.3 Serving artifacts safely — the important part

Uploaded HTML is untrusted-by-construction code running in the browser. If it is served from the portal's own origin, any script inside it — including a mistake in something Claude generated — can read the session cookie and act as the signed-in user. So:

1. Files live in a **private** Supabase Storage bucket. No public bucket, ever.
2. The viewer page (`/c/[client]/i/[item]`) is a normal authenticated portal page carrying the KOODOS chrome — title, breadcrumb, version selector, download, comments, acknowledge panel.
3. The artifact itself renders in an `<iframe>` whose `src` is a **short-lived signed URL** (60-second TTL) minted server-side after the membership check passes.
4. The iframe is sandboxed: `sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"`. Deliberately **no `allow-same-origin`** — the frame gets an opaque origin, so it cannot reach the parent document, cookies, or the Supabase session.
5. Signed URLs are served from the Supabase storage domain, a separate origin from the portal, so cookie exposure is architecturally impossible rather than merely policed.
6. A `Content-Security-Policy` header on the portal restricts `frame-src` to the storage origin only.

**Known constraint to design around:** an opaque-origin iframe cannot use `localStorage`, `sessionStorage`, or `IndexedDB` — those calls throw. Static artifacts (reports, proposals, analyses) are unaffected. Interactive artifacts that persist state — the design-track tweaker tools, for instance — must be deployed separately and added as a `link` item instead. Note this in the admin upload UI so the rule is visible at the point of decision rather than discovered later.

**Direct-link fallback:** the viewer offers "open full screen", which mints a fresh signed URL and opens it in a new tab. The URL is short-lived and unguessable, and access has already been checked. Clients who forward that URL are forwarding a link that dies in a minute.

---

## 7. Admin experience

Route: `/admin`. Single-column, dense, keyboard-friendly. This is a working tool, not a showcase.

### 7.1 Clients

- List of clients with item count, last activity, and a pending-acknowledgement badge.
- Create client: name, slug (auto-derived, editable), optional accent colour and logo for light workspace branding.
- Client detail: the folder tree, plus the member list.
- Archive client. Archived clients disappear from the list and their users lose access.

### 7.2 Members

- Invite by email, with optional name. Sends the invite email immediately.
- Member list shows email, name, invited date, first sign-in date, last seen.
- Resend invite. Revoke access (deletes the membership; the auth user remains, in case they belong to another client).

### 7.3 Folders and items

- Create, rename, reorder and archive folders inline.
- **Drag and drop upload:** drop one or more files onto a folder. `.html` files become `artifact` items, everything else becomes `file` items. Title defaults to a title-cased filename, or to the HTML `<title>` where present — prefer the `<title>`, it is almost always the better label.
- Add link item: URL, title, description.
- Per-item fields: title, short description (one or two lines, shown on the dashboard card), folder, published/draft, requires-acknowledgement toggle.
- **Draft state:** items are invisible to clients until published. Upload, check the render, then publish.
- Drag to reorder within a folder and to move between folders.
- Re-upload onto an existing artifact creates a **new version**. The item's URL is unchanged, the previous version stays retrievable, and an optional one-line version note records what changed. This is the mechanism behind "a live report that updates as the project progresses".
- Archive item.

### 7.4 Inbox

A single cross-client feed of new comments and new acknowledgements, newest first, each linking straight to the item. Unread count in the admin nav. This is what stops the tool from needing to be checked.

---

## 8. Client experience

Route: `/c/[client-slug]`. Calm, generous, closer to a well-made document index than to a SaaS dashboard. Client's name and logo in the header; KOODOS credited quietly in the footer.

- **Sign-in:** `/login`, single email field, magic link. On return, straight to their workspace. A user who somehow belongs to more than one client gets a chooser; otherwise they never see one.
- **Dashboard:** folders as sections, items as cards. Each card shows title, description, type icon, date added, an "Updated" marker when a new version has landed since their last visit, and an "Action needed" marker when acknowledgement is outstanding.
- **Item view:** portal chrome around the rendered artifact. Breadcrumb back to the folder. Download original. Version history where more than one version exists.
- **Comments:** a flat thread below the artifact. Plain text plus links, no rich editor. Author name, relative timestamp. Author may edit within 15 minutes, then it is fixed. Every new comment emails the other party.
- **Acknowledgement:** where an item requires it, a panel below the artifact states what is being acknowledged, takes a typed full name, and records name, user, timestamp, IP and user agent on submit. Afterwards the panel shows who acknowledged and when. It is a record of receipt and agreement in principle, not a signature product — where a signature genuinely matters, use a signature service and add the executed document here as a `file` item.
- **No client uploads, no folder editing, no invites.** The client's workspace is read-and-respond.

---

## 9. Data model

Postgres via Supabase. SQL migrations checked into the repo. `supabase-js` for queries so that RLS applies by default.

```
profiles          id (=auth.users.id) · email · full_name · role('admin'|'client') · created_at · last_seen_at

clients           id · name · slug(unique) · accent_color · logo_path · status('active'|'archived')
                  · created_at

memberships       id · client_id → clients · profile_id → profiles · role('owner'|'member')
                  · invited_at · first_seen_at · unique(client_id, profile_id)

folders           id · client_id → clients · parent_id → folders (nullable; depth 1 enforced in v1)
                  · name · position · archived_at · created_at

items             id · client_id → clients · folder_id → folders (nullable = client root)
                  · type('artifact'|'link'|'file') · title · description · position
                  · url (link only) · current_version_id → item_versions (nullable)
                  · requires_ack(bool) · published_at (null = draft) · archived_at
                  · created_at · updated_at

item_versions     id · item_id → items · storage_path · mime_type · size_bytes
                  · version_note · created_at

acknowledgements  id · item_id → items · profile_id → profiles · typed_name
                  · ip · user_agent · created_at · unique(item_id, profile_id)

comments          id · item_id → items · profile_id → profiles · body
                  · created_at · edited_at · deleted_at

events            id · client_id · actor_id → profiles (nullable) · item_id (nullable)
                  · type · meta(jsonb) · created_at
```

Notes:

- `events` is written from day one — `item.published`, `item.viewed`, `version.uploaded`, `comment.created`, `ack.created`, `user.signed_in`. Nothing surfaces it to the admin in v1 (per-item view tracking was explicitly not requested), but capturing it now means the read-receipt and activity-timeline features are a query away rather than a backfill that can never happen.
- Storage layout: `artifacts/{client_id}/{item_id}/{version_id}.html`. Client-scoped paths keep storage policies simple and export trivial.
- `position` is a float or a sparse integer so reordering is a single-row update rather than a rewrite of the folder.

---

## 10. Technical decisions

| Area | Choice | Reasoning |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Server components suit an auth-gated read-heavy app; server actions cover the whole admin surface without a separate API layer. |
| Styling | Tailwind | Existing preference; suits agentic iteration. |
| Backend | Supabase — Postgres, Auth, Storage | Magic-link auth, row-level security, and private file storage in one dependency. Building token tables and picking a separate blob store would be the larger part of this build. |
| DB access | `supabase-js` with the user's JWT; service role only in explicit server actions | Keeps RLS as the real boundary. |
| Migrations | Plain SQL files in `supabase/migrations` | Reviewable, no ORM abstraction over policies. |
| Drag and drop | `dnd-kit` | Reordering and cross-folder moves; better accessibility than the alternatives. |
| Email | Resend, React Email templates | Invites, comment notifications, acknowledgement receipts. Supabase's default auth emails are replaced so magic links look like KOODOS. |
| Hosting | Vercel | Existing pipeline. |
| Domain | A dedicated subdomain, e.g. `work.getkoodos.com` | No coupling to the parked portal subdomains. |

**Dependency discipline:** no component library beyond headless primitives. The surface is small and the visual character matters more than the delivery speed of a settings panel.

---

## 11. Designed for v2 — tasks and kanban

Not built now. The model below is recorded so v1 does not foreclose it.

```
tasks       id · client_id · title · description · status · position
            · assignee('koodos'|'client') · created_by → profiles
            · due_date · item_id (nullable, links a task to a deliverable)
            · created_at · completed_at

task_comments   (mirrors comments)
```

- Statuses are a fixed enum in v2 (`requested`, `accepted`, `in_progress`, `review`, `done`), client-visible in plain language.
- Client view: their own tasks, in a simple list or a three-column board, with the ability to raise a request.
- Admin view: a kanban spanning **all** clients, with the client shown on every card and filterable.
- `client_id` on `tasks` plus the existing membership RLS pattern means the cross-client admin board and the isolated client board are the same query with a different policy.
- Support-hours accounting sits with tasks when it arrives, not with items.

---

## 12. Non-functional requirements

- **Security:** private storage only; signed URLs ≤ 60s; sandboxed iframes without `allow-same-origin`; RLS on every client-scoped table; service role key server-side only; CSP restricting `frame-src` and `script-src`; rate limit on the magic-link request endpoint.
- **Performance:** dashboard interactive in under 1.5s on a normal connection. Artifact render is bounded by the artifact itself; warn on upload above 5 MB.
- **Limits:** 25 MB per file, 200 items per client, 20 versions per item. Soft limits with clear errors, not silent truncation.
- **Accessibility:** WCAG 2.1 AA on all portal chrome. Artifacts are the responsibility of whoever authored them, which is to say KOODOS.
- **Responsive:** clients will open these on phones. The viewer must handle a desktop-width artifact gracefully — horizontal scroll within the frame, never a broken page.
- **Browser support:** current Chrome, Safari, Firefox, Edge.
- **Export:** a one-command script producing a JSON dump of all tables plus the storage tree. Given this tool may be superseded, the exit has to exist before it is needed.

---

## 13. Build order

| Milestone | Contents | Done when |
|---|---|---|
| **M0 — Foundation** | Next.js scaffold, Supabase project, schema and RLS, magic-link sign-in, admin/client role split, protected routing | Mark signs in as admin; a seeded client user signs in and sees an empty workspace |
| **M1 — Admin structure** | Client CRUD, member invites, folder CRUD, reorder | A full client with folders exists, created entirely through the UI |
| **M2 — Artifacts** | Upload, storage, versions, signed-URL viewer, sandboxed iframe, link and file items | A real artifact uploads and renders correctly inside the portal, and cannot be reached signed-out |
| **M3 — Client portal** | Dashboard, item view, updated/action markers, branding, mobile | Rooted Education's workspace is usable by a real client |
| **M4 — Response** | Comments, acknowledgements, email notifications, admin inbox | A client comments and acknowledges; Mark is emailed and sees both in the inbox |
| **M5 — Finish** | Drafts, archiving, empty states, error states, export script, rate limiting | Ready to hand to a second client without explanation |

M0–M3 constitute a genuinely useful tool. M4 is what makes it better than a folder of links.

---

## 14. Acceptance criteria

- [ ] Only an invited email address can obtain a magic link; unknown addresses receive no account and no distinguishable response.
- [ ] A signed-in client user requesting another client's workspace, item, or artifact URL receives 404 — verified against RLS, not just the router.
- [ ] A signed-out request to an artifact's storage path fails.
- [ ] An artifact containing `<script>document.cookie</script>` cannot read the portal session.
- [ ] Dropping an HTML file onto a folder produces a published-ready item in under 30 seconds.
- [ ] Re-uploading an artifact leaves the item URL unchanged and the previous version retrievable.
- [ ] An item marked draft is invisible to the client and returns 404 at its direct URL.
- [ ] An acknowledgement records typed name, user, timestamp, IP and user agent, and cannot be submitted twice.
- [ ] A comment from either party emails the other within a minute.
- [ ] The export script produces a restorable dump of data and files.

---

## 15. Risks and open questions

| Risk | Mitigation |
|---|---|
| Uploaded HTML is executable code from a generative pipeline | Opaque-origin sandbox, separate serving origin, CSP. Treated as architecture, not as review discipline. |
| Superseded by the larger portal programme | Clean export from M5; no data trapped in a format only this app understands. |
| Interactive artifacts break under the sandbox | Documented at the point of upload; `link` items are the escape hatch. |
| Clients forward signed URLs | 60-second TTL makes forwarded links useless within a minute. |
| Storage growth from versioned artifacts | Version cap per item; artifacts are small; revisit if it becomes real. |

**Open questions**

1. Does an item ever need to be visible to some members of a client but not others? Assumed no. If it becomes yes, it is an item-level ACL and worth knowing before M1.
2. Should the client see a KOODOS-branded portal or their own? Assumed light client branding (logo, accent) in a KOODOS-designed shell.
3. Do you want the welcome artifact to be a per-client template you fill in, or written fresh each time? Templating is cheap at M3 and awkward later.
4. Is `work.getkoodos.com` the domain, or something client-facing that does not read as internal — `space.`, `studio.`, `portal.`?
