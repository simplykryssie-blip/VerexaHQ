# VerexaHQ Platform Design Authority

This is the single source of truth for how VerexaHQ is actually built today.
It replaces a set of older root-level docs (README, audit/gap/completion
reports, a "Canonical Backend Contract", a Bolt import guide) that were
removed because they described a different, disconnected codebase — a
different Supabase project (`euxfopzgdmlmgcmmjvic` vs. the real
`daxpavvsotvsyqqntddc`), a different table naming scheme
(`workspace_members`, `workspace_brand_profiles`, `tax_organizer_templates`),
and features (Payroll, Bank Import, Stripe Checkout, Bolt packaging) that
never existed in the code that actually ships from this repo. If you find a
claim below that production disagrees with, trust production and fix this
file, not the other way around.

Repo: `simplykryssie-blip/VerexaHQ` · Branch: `claude/verexa-tax-office-v2-mhd9mo`
Supabase project: `daxpavvsotvsyqqntddc` · Stack: Next.js 14 App Router, `@supabase/ssr`

## Authentication

Session handling is cookie-based via `@supabase/ssr`: `lib/supabase/client.ts`
(browser), `lib/supabase/server.ts` (RSC/route handlers), `lib/supabase/middleware.ts`
(refreshes the session on every request; `middleware.ts` at the repo root wires it in).

- **Sign up** — `/login` (sign-up mode) collects first/last name, firm name,
  email, password. `supabase.auth.signUp` with `emailRedirectTo` pointing at
  `/auth/confirm`; shows a "check your email" screen rather than redirecting
  immediately.
- **Email verification** — `/auth/confirm` (`app/auth/confirm/route.ts`)
  exchanges the PKCE `code` (or legacy `token_hash`+`type`) for a session,
  then redirects to `next` (defaults to `/dashboard`; `(app)/layout.tsx`
  redirects to `/onboarding` if the user has no workspace yet).
- **Login** — email/password with a Remember Me checkbox.
- **Forgot/reset password** — `/forgot-password` calls
  `resetPasswordForEmail` with `redirectTo` set to `/auth/confirm?next=/reset-password`,
  reusing the same code-exchange logic instead of duplicating it. `/reset-password`
  just calls `updateUser({ password })` once the session from that exchange exists.
- **Change password** — Settings → Security has a dedicated form
  (`ChangePasswordForm.tsx`) calling `updateUser({ password })`, separate
  from the workspace-wide security *policy* form on the same page.
- **Logout** — `POST /api/auth/sign-out`.
- **Remember Me** — the installed `@supabase/ssr` (0.12.4) hardcodes a
  400-day cookie `maxAge` on every session-cookie write and ignores any
  `cookieOptions.maxAge` override (confirmed by reading `node_modules/@supabase/ssr/dist/main/cookies.js`
  directly — the library always does `{...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge}`,
  with its own default *last* in the spread). Working around that: a
  companion `sb_remember` cookie is set by `/api/auth/set-remember` after
  login — `"persistent"` with a long `maxAge` if checked, `"temporary"`
  with **no** `maxAge` (a true browser-session cookie) if unchecked.
  Middleware signs the user out if it finds a valid Supabase session but no
  `sb_remember` cookie at all, which only happens once the temporary marker
  has died from the browser closing. Email-link flows (verification, reset,
  invitations) don't offer the choice and default to persistent.
- **Staff invitations** — `workspace_invitations` (email, role, token,
  status, expiry) plus three RPCs: `create_workspace_invitation` (admin-only,
  upserts the pending invite for that email/workspace pair rather than
  duplicating it), `accept_workspace_invitation_by_token` (verifies the
  caller's auth email matches, then upserts into `workspace_users`), and
  `get_invitation_preview` (deliberately callable by `anon` — it's the only
  way for someone without an account yet to see "you've been invited to
  join `<workspace>` as `<role>`" before they sign up). This exists because
  the older `invite_workspace_user` RPC requires the invitee to already have
  an account, which doesn't cover the common case of inviting someone new.
  UI: Settings → Users (invite form + pending list with revoke) and the
  public `/accept-invitation?token=...` page.
- **Protected routes** — `PUBLIC_PATHS` allowlist in `lib/supabase/middleware.ts`
  (`/login`, `/auth/confirm`, `/forgot-password`, `/accept-invitation`, ...);
  everything else requires a session, and `(app)/layout.tsx` additionally
  requires a workspace.
- **Role-aware authorization** — enforced at the database layer via RLS
  policies calling `has_permission(workspace_id, key)`, `is_workspace_admin(workspace_id)`,
  and `is_workspace_member(workspace_id)`. The frontend does not yet
  duplicate these checks to hide UI a user can't act on (a UX gap, not a
  security one — RLS is the actual enforcement boundary regardless of what
  the UI shows).

## Workspace Provisioning

`/onboarding` calls the `create_workspace` RPC after email verification,
then upserts the owner's `user_profiles` row from their signup metadata
(first/last name, firm name). The RPC is the transactional boundary — it's
one database call, not client-orchestrated multi-step provisioning, so
there's nothing on the frontend that can leave a half-created workspace
behind.

## Email / SMS Infrastructure

Two provider-agnostic send paths, both gated by `lib/providerStatus.ts`
(`isEmailConfigured()` / `isSmsConfigured()` / `isStripeConfigured()` —
purely env-var presence checks) so an unconfigured environment degrades to
`{ sent: false, reason: "... not configured" }` instead of throwing:

- **Email** — `lib/email/resend.ts` calls Resend's HTTP API directly via
  `fetch` (no SDK dependency). `lib/email/template.ts` is the one shared
  branded HTML wrapper every email should render through. Five named system
  sender identities live in `SYSTEM_SENDERS`
  (`noreply`/`support`/`billing`/`notifications`/`team@verexahq.com`) — real
  once the `verexahq.com` domain is verified in Resend and `RESEND_API_KEY`
  is set; `EMAIL_FROM_ADDRESS` overrides all of them with one address if
  you'd rather keep it simple. `POST /api/email/send` is the generic
  authenticated endpoint; `POST /api/invitations` sends the invite email
  directly server-side rather than round-tripping through it.
- **SMS** — `lib/sms/twilio.ts`, same `fetch`-based pattern, `POST /api/sms/send`.
- **Status** — `GET /api/provider-status` reports which of email/SMS/Stripe
  are actually configured, for any settings UI that wants to show it.
- **Per-workspace sender customization** — `branding` has
  `email_from_name`, `support_email`, `business_email`, and now also
  `reply_to_email`, `billing_email`, `notification_email` for firms to
  override display name/reply-to on outgoing mail. Not yet wired into the
  send path — the columns exist, the read side doesn't yet.

None of this has live credentials in this environment. It's real,
callable, production-shaped code; it has not been exercised against an
actual Resend or Twilio account.

## Billing

Schema (Epic 4): `engagement_pricing`, `quotes`, `change_orders`, `invoices`,
`payment_methods`, `payments`, `recurring_billing`, `client_ledger`, all
workspace-scoped with RLS via `billing.view`/`billing.manage`/`billing.refund`.
Quote/invoice numbering is advisory-lock-protected per-workspace-per-year.
Triggers cascade a payment into the invoice's paid status and a
`client_ledger` entry automatically. Frontend: the Billing tab on both the
Client Workspace and Engagement Workspace, plus Quick Actions to create a
quote or invoice. There is no Stripe integration wired up — no webhook
route, no Checkout session creation, no `STRIPE_SECRET_KEY` in this
environment. Payments today are recorded manually (status/amount typed in),
not captured through a payment processor.

## Security

- RLS is enabled on every application table; policies gate on
  `has_permission`/`is_workspace_admin`/`is_workspace_member` scoped to
  `workspace_id`, which is how multi-tenant isolation is actually enforced
  (not application-layer filtering).
- `audit_trigger_fn` fires on insert/update/delete for the tables that need
  an audit trail, writing to `activity_log`.
- SECURITY DEFINER trigger/RPC functions that shouldn't be directly
  callable over PostgREST have `EXECUTE` revoked from `public`/`anon`/`authenticated`
  as they're added; `get_invitation_preview` is the one deliberate exception
  and is documented as such above.
- **Not implemented**: SSN/EIN field-level masking or encryption. Client
  PII fields exist in the schema as plain columns today — this is a real
  gap before handling real taxpayer data in beta, not just a nice-to-have.
- Service-role keys and Stripe/Resend/Twilio secrets are server-only env
  vars, never exposed under `NEXT_PUBLIC_*`.

## Deployment

Single Next.js app at the repo root (a legacy v1 app and a disconnected
scaffold were previously consolidated/removed from this same repo — see the
note at the top of this file). Single Supabase project
(`daxpavvsotvsyqqntddc`); `.env.local.example` was pointing at a different
project ID until this pass and has been corrected. Vercel builds are
triggered by pushes to this branch through Vercel's own git integration —
this session has no Vercel API/dashboard access, so it cannot trigger a
deploy on demand or report a deployment URL; check the Vercel dashboard
after a push lands.

## Testing

No automated test suite (unit or E2E) exists yet. What actually gets run
before anything is considered done:

- `tsc --noEmit` and `next build` after every change.
- Supabase security + performance advisors after every migration, with
  findings either fixed or explicitly noted as intentional (e.g. the one
  `anon`-callable RPC above).
- Targeted SQL smoke tests (`DO $$ ... $$` blocks that create, assert, and
  clean up a real scenario) for new schema/RPCs — used for the billing
  cascade, task dependencies, and the invitation create/preview/accept path.
- No scripted browser E2E exists. Manual click-through has covered the core
  flows as they were built; there is no regression suite guarding against
  breaking them later.

## Known gaps going into beta

- Stripe, Resend domain verification, GoDaddy DNS (SPF/DKIM/DMARC), and a
  live Twilio account — all require credentials/dashboard access this
  session doesn't have.
- SSN/EIN masking.
- Client Portal — not started, explicitly deferred.
- Frontend permission-gating (hiding actions a role can't perform) beyond
  RLS enforcement itself.
- Automated test coverage.
