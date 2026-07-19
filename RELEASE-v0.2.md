# VerexaHQ v0.2 — Beta Core Release

## Included in this release

- New workspace Brand Center connected to the live `workspace_brand_profiles` table.
- Private logo uploads through the `workspace-brand-assets` Supabase bucket.
- Branding controls for office names, colors, fonts, logo placement, contact details, footer, disclaimer, and watermark.
- Live document preview in Settings → Branding.
- Redesigned dashboard command center with workspace-scoped metrics.
- Active clients, open tasks, missing documents, and unpaid invoice balance cards.
- Today’s work, upcoming deadlines, recent document activity, and quick actions.
- Existing tax, bookkeeping, payroll, billing, portal, document, form, task, and pipeline routes preserved.
- Removed the unused nested manual-install ZIP from the project source.

## Deployment

1. Add your existing Vercel environment variables.
2. Run `npm install`.
3. Run `npm run typecheck`.
4. Run `npm run build`.
5. Deploy through Vercel.

The Supabase backend for Brand Center must already be installed. It is live in the connected VerexaHQ project.
