# Developer setup guide

## Prerequisites

- Node.js (whatever version `package.json`'s `engines` field specifies, or the current LTS)
- Access to the live Supabase project `aewqbffscdrziiwfomyf` — this app has no local/offline Supabase
  stack; every environment (including your local dev server) talks to the same live project. There is
  no seed script that spins up a fresh database, because there's only one database.

## First-time setup

```bash
cd apps/verexa-tax-office
npm ci
cp .env.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://aewqbffscdrziiwfomyf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get the anon and service-role keys from the Supabase dashboard (Project Settings → API) or via the
Supabase MCP tools (`get_publishable_keys` / `get_project_url`) if you have them available. Leave the
`TWILIO_*`/`RESEND_*`/`ZOOM_*` lines blank locally — the app is designed to run correctly without them.

```bash
npm run dev
```

Visit `http://localhost:3000`. If you don't have a workspace yet, sign up and go through onboarding —
it creates a real workspace against the live database (see `create_workspace_with_owner` in
`ARCHITECTURE.md`).

## Getting a portal test account

The client portal (`/portal`) needs a `clients` row whose `portal_user_id` is set, which normally
happens via a real invite email (see below). For quick local iteration without sending an email:

1. Sign up/sign in as staff and create (or find) a client in `/clients`.
2. On that client's detail page, click **Invite to portal** (requires `SUPABASE_SERVICE_ROLE_KEY` to
   be set — this hits `/api/portal/invite`, which uses the Admin API).
3. Check the inbox for the email address on that client record for the invite email, and follow it —
   it lands on `/portal/reset-password` to set a password, then redirects into `/portal`.

If you don't have email delivery configured for the Supabase project locally, use the Supabase
dashboard's Auth → Users page to find the generated user and manually trigger a password reset, or
temporarily set a password for that user via the dashboard.

## Regenerating types after a schema change

```bash
supabase gen types typescript --project-id aewqbffscdrziiwfomyf > types/database.ts
```

Do this any time a migration is applied to the live project. Never hand-edit `types/database.ts`.

## Checks to run before committing

```bash
npm run typecheck
npm run lint
npm run build
```

All three should be clean. `npm run build` is the strongest signal (it re-runs type-checking and
linting as part of `next build`), but running `typecheck`/`lint` first gives faster feedback while
iterating.

## Conventions to follow (see `ARCHITECTURE.md` for the why)

- **Client components mutate directly.** `"use client"` components call `createClient()` from
  `@/lib/supabase/client` and call `.insert()/.update()/.delete()` or `.rpc()` directly — there's no
  server-action layer for ordinary CRUD. Server Components (`@/lib/supabase/server`) are for reads.
- **Never use `.insert(...).select(...)` against `conversations`, `documents`, or
  `intake_submissions`.** Generate the id client-side and skip `.select()` — see
  `ARCHITECTURE.md`'s "INSERT ... RETURNING / RLS gotcha" section. This is not a stylistic preference;
  the chained form reliably fails RLS for these three tables.
- **Enum label maps are `Record<Enums<'x'>, string>`,** never `Record<string, string>` — pull the
  type from `types/database.ts` so the compiler catches a missing value.
- **Storage reads are always `createSignedUrl`,** never `getPublicUrl`.
- **The service role (`lib/supabase/admin.ts`) is reserved** for the handful of operations RLS
  structurally can't express (see `ARCHITECTURE.md`). If you think you need a fifth call site, first
  check whether an existing RPC or a plain RLS-scoped write actually does the job.
- **Never invent an RPC or a table.** If a feature seems to need backend logic that doesn't exist,
  check `types/database.ts`'s `Functions`/`Tables` sections (or query `pg_proc`/`information_schema`
  against the live project) before assuming it's missing — this schema is large and most operations
  already have a sanctioned path.
- **Portal code lives under `app/portal/`, `components/portal-shell/`, and `features/portal/`,**
  separate from the equivalent staff modules, even when the underlying data is the same. Reuse a
  staff *query function* where its signature already fits (many do, since RLS does the real scoping)
  — but never reuse a staff *component*, since a portal page must control exactly which columns get
  passed into a `"use client"` child (see the RSC-payload note in `ARCHITECTURE.md`).

## Troubleshooting

- **"Not authorized" from an RPC in local dev:** most `SECURITY DEFINER` RPCs check the caller's role
  or `auth.uid()` against `workspace_members`/`clients` — make sure you're signed in as a session that
  actually has the membership/portal link the RPC expects.
- **A new insert silently fails RLS with no obvious cause:** if it's chained with `.select()`, check
  whether it's inserting into `conversations`, `documents`, or `intake_submissions` — see the RETURNING
  gotcha above.
- **Portal invite email doesn't arrive:** confirm `SUPABASE_SERVICE_ROLE_KEY` is set and check the
  Supabase project's Auth → Logs for the actual send attempt; local dev has no separate email sandbox.
