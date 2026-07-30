# Deployment

## What you need before deploying

1. **Access to the live Supabase project** `aewqbffscdrziiwfomyf` ("VerexaHQ Tax Office"). This app
   connects to that project only — never create a new Supabase project for it, and never point it at
   the root `VerexaHQ` app's project.
2. A host for the Next.js app itself. Vercel is the natural fit for a Next.js 14 App Router project
   (zero-config, matches the framework's own deployment target) but any Node host that supports
   `next build && next start` works.
3. The environment variables in `.env.example`, filled in for production.

## Environment variables

| Variable | Where it's used | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Every Supabase client (browser + server) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Every Supabase client (browser + server) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` — server-only, never sent to the browser | Yes, for team invites, portal invites, and e-signature magic links to work |
| `NEXT_PUBLIC_APP_URL` | Constructs redirect URLs for password reset, team/portal invite emails, and portal set-password links | Yes |
| `TWILIO_*` | `settings/integrations` presence check only — nothing sends SMS yet | No |
| `RESEND_*` | Same, for email | No |
| `ZOOM_*` | Same, for Zoom meeting creation | No |

Never commit a filled-in `.env.local` or `.env.production`. `SUPABASE_SERVICE_ROLE_KEY` in particular
grants full database access, bypassing every RLS policy — treat it like a root password.

## Supabase-side configuration

The database, RLS policies, RPCs, storage buckets, and auth settings already exist live in the
Supabase project — this app has never created its own tables or duplicated the schema. Two things do
need to be configured in the Supabase dashboard (Auth → URL Configuration) before invite/reset flows
work correctly in production:

- **Site URL** should match `NEXT_PUBLIC_APP_URL`.
- **Redirect URLs** allow-list should include:
  - `{APP_URL}/auth/confirm` and `{APP_URL}/reset-password` (staff)
  - `{APP_URL}/portal/reset-password` (portal — used for both password-reset and completing a portal
    invite, since a newly-invited client has no password yet)

If these aren't set, Supabase's invite/recovery emails will link back to `localhost` or fail to
redirect, even though the invite/reset logic itself is correct.

### Storage buckets

Five buckets are used, all already provisioned on the live project: `tax-client-documents`,
`firm-resources`, `return-review-files`, `signature-documents`, `workspace-brand-assets`. None of them
should ever be made public — every read in this app goes through a signed URL. If you're setting up a
*new* Supabase project from scratch (e.g. a staging clone), recreate these buckets with the same RLS
policies as production rather than making them public "to make it easier" — that defeats the signed-URL
model everywhere in the codebase.

## Build and deploy

```bash
cd apps/verexa-tax-office
npm ci
npm run typecheck
npm run lint
npm run build
npm start   # or deploy the .next output to your host
```

`npm run build` runs Next's own type-checking and linting as part of the build (`next build`), so a
green build already implies a green `typecheck`/`lint` — running them separately first just gets you a
faster failure signal in CI.

### On Vercel specifically

- Set the **Root Directory** to `apps/verexa-tax-office` (this is a subdirectory of a larger repo, not
  a standalone repo root).
- Set all the environment variables above in the Vercel project settings, scoped to whichever
  environments (Production/Preview/Development) should reach the live Supabase project. Consider using
  a separate Supabase branch/project for Preview deployments if you don't want preview builds writing
  to production data — this app doesn't currently distinguish environments itself.
- No custom build command is needed — Vercel's Next.js preset handles it.

## After deploying

- Confirm a fresh sign-up/sign-in round-trip on `/sign-in` and `/portal/sign-in`.
- Send a real team invite and a real portal invite end-to-end (requires `SUPABASE_SERVICE_ROLE_KEY`
  and the redirect URLs above to be correct) — the invite email should land the recipient on
  `/reset-password` or `/portal/reset-password` respectively with a working session.
- Open `/settings/integrations` and confirm Twilio/Resend/Zoom correctly show "Not Connected" until
  you actually add those credentials — this is the intended state, not a bug.
- Run the RLS spot-checks described in the README's Testing section against production if you change
  any RLS policy — this app has no automated test suite, so live verification is the only signal.
