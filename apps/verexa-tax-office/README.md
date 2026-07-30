# Verexa Tax Office

A secure tax-office operations platform for independent preparers, EROs, tax offices, and service
bureaus. Verexa currently tracks e-file statuses and external tax-software references — it does not
transmit tax returns.

This app is **independent** from the root `VerexaHQ` app in this repository. It has its own
`package.json`, its own environment variables, and connects only to its own Supabase project
(`aewqbffscdrziiwfomyf`). Nothing here reads from, writes to, or shares types with the root app or its
Supabase project (`euxfopzgdmlmgcmmjvic`).

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · hand-authored shadcn/ui-style
components · Supabase (`@supabase/ssr`) · React Hook Form + Zod · TanStack Table/Query · Recharts ·
date-fns · Lucide icons.

## Setup

```bash
cd apps/verexa-tax-office
npm ci
cp .env.example .env.local   # fill in the Supabase values below
npm run dev
```

### Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://aewqbffscdrziiwfomyf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server-only, never sent to the browser>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The anon key is safe to use client-side — every read/write goes through the signed-in user's session
so Postgres Row Level Security stays active. The service-role key is only ever meant to be used from
secure server-side code (none of the code in this initial build uses it yet).

### Deferred provider variables

These are documented for later and never block normal navigation. Every dependent feature shows an
explicit "not connected" state instead of failing.

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_WEBHOOK_SECRET=
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_USER_ID=
ZOOM_WEBHOOK_SECRET_TOKEN=
```

## Regenerating types

Database types live in `types/database.ts`, generated from the live `aewqbffscdrziiwfomyf` project.
Regenerate after any schema change — never hand-edit this file:

```bash
supabase gen types typescript --project-id aewqbffscdrziiwfomyf > types/database.ts
```

## What's built so far

**Foundation:** Supabase browser/server clients, session-refresh middleware, sign-in/sign-up/forgot-
password/reset-password, email confirmation handling, workspace resolution (single workspace
auto-selects, multiple workspaces show a chooser, cookie-persisted selection), a role-aware app shell
(collapsible sidebar, mobile nav, workspace switcher, header search/notifications/help/user menu), and
unauthorized/suspended/trial-expired/error/not-found states.

**Onboarding:** a 10-step flow (welcome → workspace type → business info → professional role → office
structure → branding → services → team setup → trial plan → completion) that creates a real workspace,
owner membership, professional profile, starter services, and a trialing subscription.

**Core operations:** dashboard (real Supabase views), leads (table + pipeline, add/edit, convert to
client), clients (search/filter/sort/paginate, create, detail with Overview/Contacts/Services/
Engagements/Notes tabs), households (create, add/remove members, primary taxpayer/spouse/dependents),
services, tax engagements (list, creation wizard, detail with status changes and activity history), and
a work queue (all-office / my-assignments views).

## Known simplifications in this pass

- The engagement wizard covers client/household/tax year/return type/engagement type/jurisdiction/
  staff assignment/priority in one screen rather than the full multi-step wizard; intake-template and
  document-request-template selection will attach once those modules exist.
- The work queue currently has a table view only; kanban/calendar/deadline views are not yet built.
- The client detail page's Household/Intake/Documents/Tasks/Messages/Appointments/Billing/Signatures/
  Activity tabs are placeholders until those modules land.
- Client-list pagination is client-side over the filtered result set (fine at normal client-list sizes;
  server-side pagination is a reasonable follow-up for very large workspaces).

## Not yet built

Intake organizers, compliance, documents, document requests, tasks, secure messages, notifications,
calendar/appointments, billing/invoices/payments, signatures, return release, e-file tracking,
templates, workflows, team management, workspace relationships, reports, settings, subscription
management, audit logs, and the client portal. These follow the same phased plan and the same
no-mock-data standard as everything above.

## Backend additions made during this build

Two small, additive changes to the live Supabase project (see `supabase/migrations/` at the repo root
for the exact SQL):

1. **`create_workspace_with_owner` RPC.** `workspace_members`' INSERT policy requires
   `has_workspace_role(workspace_id, ['owner','admin'])`, which only checks *existing* membership rows —
   so a brand-new workspace's first member could never be inserted under RLS. This one
   `SECURITY DEFINER` function (same pattern as the project's existing `has_workspace_role`/
   `is_workspace_member` helpers) creates a workspace owned by `auth.uid()` and inserts exactly one
   `owner` membership row for that same user. Verified live against real RLS with a throwaway
   authenticated session before being used in the app.
2. **Seeded `subscription_plans`.** This table existed with zero rows; `workspace_subscriptions.plan_id`
   is `NOT NULL`, so onboarding had nothing valid to reference. Seeded three baseline plans (solo /
   office / bureau) as data — no schema change.

## Testing

Automated tests aren't in place yet for this pass. The workspace-bootstrap RPC (the highest-risk new
piece) was verified live against real RLS — not just read — using a throwaway authenticated Postgres
session (`SET ROLE authenticated` + a simulated JWT claim, never an RLS bypass), then cleaned up
completely.
