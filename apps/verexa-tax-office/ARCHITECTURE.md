# Architecture

## Overview

Verexa Tax Office is a Next.js 14 App Router application backed entirely by one Supabase project
(`aewqbffscdrziiwfomyf`). There is no separate backend service — Postgres, Row Level Security (RLS),
and Supabase Auth/Storage *are* the backend. The Next.js layer is a thin, typed client over that
database: almost every mutation is a direct `supabase.from(...).insert/update/delete(...)` call from a
`"use client"` component, relying on RLS to decide what's actually allowed. This is a deliberate,
consistent choice made from Phase 1 onward — not every app should be built this way, but this one is,
throughout.

## Two app surfaces, one codebase

```
app/
  (auth)/          staff sign-in, sign-up, forgot/reset password
  (app)/           the staff CRM — every internal module (clients, engagements, billing, …)
  portal/
    (portal-auth)/ portal sign-in, forgot/reset password — no session required
    (portal-app)/  the authenticated client portal — dashboard, documents, invoices, …
    sign/[token]/  public e-signature magic link — no session, no portal login, ever
  api/             route handlers that need the service-role key (see below)
```

Both `(app)` and `(portal-app)` are Next.js route groups with their own `layout.tsx` that resolves
identity and redirects unauthenticated requests — `getActiveWorkspace()` (staff, from
`lib/auth/workspace.ts`) or `getPortalContext()` (portal, from `lib/auth/portal.ts`). They share the
same Supabase project and the same generated types, but nothing else: separate nav config, separate
shell components (`components/app-shell/*` vs `components/portal-shell/*`), and separate query
modules (`features/*/queries.ts` for staff, `features/portal/queries.ts` for the portal) so a portal
page can never accidentally reuse a staff query that assumes `workspace_members` membership.

`lib/supabase/middleware.ts` is the one place that has to know about both surfaces: it refreshes the
session cookie on every request and decides where to redirect an unauthenticated visitor — `/sign-in`
for anything under `(app)`, `/portal/sign-in` for anything under `/portal`, except the auth pages
themselves and `/portal/sign/[token]`, which is always public.

## Identity model

**Staff:** `auth.users` → `workspace_members` (role: owner/admin/ero/preparer/reviewer/
intake_specialist/document_specialist/billing/seasonal_staff/auditor/client). `role === "client"` is
reserved as a portal-identity capability marker and never grants access to the staff shell —
`app/(app)/layout.tsx` explicitly redirects it to `/unauthorized`.

**Portal:** `auth.users` → either `clients.portal_user_id` (the primary client record) or an active,
portal-enabled `client_contacts` row (`auth_user_id` + `can_access_portal = true` + `is_active = true`
— e.g. a spouse or secondary contact). `lib/auth/portal.ts`'s `getPortalContext()` resolves whichever
one matches and returns a single client record either way; portal pages never need to know which path
resolved it. This exactly mirrors the live RLS linkage used throughout the schema
(`can_access_client_record`, `can_access_document`, etc.) — there is no separate application-level
notion of "portal access" that could drift from what the database actually enforces.

## RLS is the real boundary

Every frontend permission check — `roleHasCapability()`, hiding a nav item, disabling a button — is a
UX courtesy. The enforcement layer is Postgres RLS policies, evaluated on every query regardless of
what the UI does or doesn't show. A hidden "Delete" button is not a security control; the DELETE
policy on that table is. This is why:

- Query functions in `features/*/queries.ts` mostly select without an explicit `workspace_id` or
  `client_id` filter beyond what's needed for correctness — RLS already scopes every row.
- The same query function is frequently reused by both a staff page and (with different arguments) a
  portal page — e.g. `getDocuments(workspaceId, { clientId })` is called from both surfaces; RLS is
  what makes the portal caller only ever see their own client-visible rows.
- Portal pages that pass query results into a `"use client"` component are careful to pass a narrow,
  explicitly-picked shape rather than the full row (see `features/portal/documents-list.tsx`'s
  `toPortalDocumentRow`) — not because RLS misses anything, but because a *column* like
  `documents.notes` or `invoices.internal_notes` is staff-authored content that a portal user
  shouldn't see even though the *row* is legitimately theirs. Every prop passed into a Client
  Component serializes into the page's RSC payload whether or not it's rendered, so this is a real
  boundary, not paranoia.

## Mutation patterns, in order of preference

1. **A `SECURITY DEFINER` RPC**, where one exists for the operation (`submit_intake`,
   `approve_and_lock_intake`, `issue_signature_token`, `complete_signature`,
   `evaluate_return_release`, `release_completed_return`, `next_invoice_number`,
   `update_client_portal_contact_info`, …). These encode business rules RLS alone can't express
   (state-machine transitions, single-use tokens, cross-table side effects) and are always the
   sanctioned path when they exist — never bypassed with a direct table write.
2. **A direct RLS-scoped table write**, where no RPC exists (compliance, document requests, billing
   line items, templates, workflow definitions, team roles, relationships). This is the correct,
   intended path for these tables — not a workaround.
3. **A service-role route handler**, only for the handful of operations RLS structurally cannot
   express. See below.

### Service-role usage

`lib/supabase/admin.ts` exports `createAdminClient()` — a service-role Supabase client that bypasses
RLS entirely. It is imported in exactly four route handlers, each of which authorizes the caller
against their *own* session before ever touching it:

- `app/api/team/invite/route.ts` — inviting a not-yet-registered user to a workspace.
  `workspace_members.user_id` is `NOT NULL`, so the `auth.users` row must exist before a membership
  row can reference it, which requires the Admin API.
- `app/api/portal/invite/route.ts` — same shape, for inviting a client to the portal.
- `app/api/portal/sign/redeem/route.ts` and `app/api/portal/sign/complete/route.ts` — see below.

No other server or client code ever imports `lib/supabase/admin.ts`. This is checked, not just
documented — grep for `createAdminClient` before adding a fifth call site, and ask whether RLS or an
RPC could do it instead.

### E-signature magic links

`redeem_signature_token` and `complete_signature` are `SECURITY DEFINER` functions whose `EXECUTE`
grant is `service_role`-only (not `anon`, and for `redeem_signature_token`, not even `authenticated`).
This means a portal login is never sufficient to sign a document — the *token* is the entire
credential, matching how e-signature magic links work in practice (the recipient may not have, or
want, a portal account). Because the browser can never call these RPCs directly, the flow is entirely
server-mediated:

1. `/portal/sign/[token]` (public, no session) loads and POSTs the token to
   `/api/portal/sign/redeem`.
2. That route uses the service-role client to call `redeem_signature_token` (marks the token used,
   logs a `viewed` event, returns `{signer_id, signature_request_id, workspace_id}`), then fetches
   display data (request title/message, signer, other signers' progress, and — if a document is
   attached — a 5-minute signed URL for it) and returns it to the page.
3. The signer types their name, checks the legal-signature acknowledgment, and the page POSTs to
   `/api/portal/sign/complete` with the *original token* (not the signer id alone — see the comment
   in that file for why re-validating the token, independent of `redeem`'s one-time `used_at` flag, is
   what actually gates this step) and the typed-signature payload. That route independently
   re-validates the token (hash, revocation, expiry — deliberately not `used_at`, which `redeem`
   already consumed for the "viewed" transition) and, only if valid, calls `complete_signature`.

No table's RLS is bypassed for reads/writes a portal session could legitimately make on its own; the
service role here is strictly filling the gap between "no session at all" and "an operation that must
still be gated by something."

## The INSERT ... RETURNING / RLS gotcha

Three tables — `conversations`, `documents`, `intake_submissions` — have a SELECT policy that
resolves *only* through a function that re-queries the same table by its own `id`
(`can_access_conversation(id)`, `can_access_document(id)`, `can_access_intake_submission(id)`).
PostgreSQL enforces SELECT policies against the RETURNING clause of an INSERT, and a row inserted by
the current statement isn't visible yet to a nested self-referential subquery evaluating that policy —
so `INSERT ... RETURNING` (i.e. `.insert(...).select(...)`) on these three tables fails RLS for every
caller, including fully authorized ones. It reproduces in a plain SQL session with no application code
involved.

**The fix, applied everywhere this pattern occurs:** generate the row's `id` client-side
(`crypto.randomUUID()`), include it explicitly in the insert payload, and don't chain `.select()` at
all — the caller already knows the id, so there's nothing to return. See the README's "A real bug this
build found and fixed" section for the full list of affected call sites. If you add a new insert
against one of these three tables and need the id back, use this pattern from the start rather than
`.insert(...).select().single()`.

## Storage

Every document/file read goes through `createSignedUrl` (5-minute expiry). `getPublicUrl` is never
called anywhere in this codebase — grep for it if you're reviewing a change; its presence is a bug.
Buckets: `tax-client-documents` (client-uploaded and staff-uploaded files, portal-readable per-row via
`can_access_document`), `firm-resources` / `return-review-files` / `signature-documents` /
`workspace-brand-assets` (workspace-member-only — not portal-readable, which is why the portal
Signatures page is a status viewer rather than a document viewer; the token-gated signing flow reads
`signature-documents` via the service-role client instead, which is unaffected by that bucket policy).

## Enums as source of truth

Every `lib/validation/*.ts` file types its label map as `Record<Enums<'enum_name'>, string>` against
the generated `types/database.ts`, not `Record<string, string>`. This makes the compiler catch a
missing enum value at build time instead of silently falling back to `.replace(/_/g, " ")` at runtime.
Never hand-write an enum's possible values — pull them from `Database["public"]["Enums"]`.
