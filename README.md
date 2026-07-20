# VerexaHQ CRM

Production-ready Next.js frontend for the existing VerexaHQ Supabase backend. This package consolidates the original Bolt app and the expanded CRM modules into one project.

## Included

- Invite-only 30-day Founding Beta signup with server-validated access codes
- Login, confirmation, password reset, workspace switching, role-aware navigation, and protected platform admin
- Dashboard, global search, clients, services, workflows/pipelines, tasks, deadlines, and calendar
- Tax returns, estimated payments, tax organizers, bookkeeping, CSV bank import, reconciliation, and report delivery
- Payroll clients, employees, runs, filings, and tax-deposit tracking
- Documents, private storage, folders, requests, templates, signed downloads, and client uploads
- Client portal, invitations, to-dos, organizers, messages, and documents
- Invoices, line items, manual payments, payment plans, recurring invoices, and Stripe Checkout
- Forms/templates, notifications, live reports, settings, subscription status, and provider health
- Resend email, Twilio SMS, and Stripe server routes

## Import into Bolt

1. Import or upload the ZIP as a new project.
2. Confirm `package.json` is at the project root and Bolt detects **Next.js**.
3. Add the environment variables from `.env.local.example` in Bolt's Secrets/Environment area.
4. Run `npm install`, then `npm run build`.
5. Publish only after the production build succeeds.

Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, or Twilio credentials through variables beginning with `NEXT_PUBLIC_`.

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=
```

The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported as a fallback.

## Provider variables

### Email — Resend

```env
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=VerexaHQ
```

### SMS — Twilio

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

### Payments — Stripe

```env
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Create a Stripe webhook for:

```text
https://YOUR-DOMAIN/api/stripe/webhook
```

Subscribe it to `checkout.session.completed` and `payment_intent.succeeded`, then save the signing secret as `STRIPE_WEBHOOK_SECRET`.

## Local commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Security

- Browser code uses only the Supabase publishable/anon key.
- Provider secrets remain in server routes.
- Staff provider routes require a valid Supabase access token.
- Stripe webhook events are signature-verified and de-duplicated.
- Documents stay in the private `verexahq-client-documents` bucket and download through signed URLs.
- Workspace isolation and permissions remain controlled by the existing Supabase RLS policies and approved RPCs.

## External limitations

Resend, Twilio, and Stripe are ready for credentials. Live bank feeds and payroll processing are not ordinary credential-only integrations: Plaid requires a secure token-storage/sync backend, and Gusto/ADP embedded payroll requires a provider partnership. The included CRM supports CSV bank import and complete payroll tracking until those agreements are in place.
