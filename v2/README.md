# Verexa Tax Office v2

Brand-new backend build for Verexa Tax Office v2, isolated from the existing
VerexaHQ (v1) application at the repository root. This directory owns its
own Supabase project and does not share schema, migrations, or data with v1.

- Supabase project: **Verexa Tax Office v2** (`daxpavvsotvsyqqntddc`, us-east-2)
- v1's project ("VerexaHQ Tax Office", `aewqbffscdrziiwfomyf`) is untouched by
  anything in this directory.

## Layout

```
v2/
  supabase/
    migrations/   -- numbered, applied in order via the Supabase MCP/CLI
    tests/         -- SQL smoke tests, safe to run directly (self-rollback)
  types/
    database.types.ts -- hand-maintained until `supabase gen types` is available
```

## Phase 0 -- Platform Foundation (complete)

Multi-tenant core: `workspaces`, global `user_profiles`, RBAC (`roles` /
`permissions` / `role_permissions` / `workspace_users`), `office_locations`,
`branding`, `system_settings`, feature flags (`feature_flags` /
`workspace_feature_flags`), and the audit/activity/notification tables
(`audit_log`, `activity_log`, `notification_queue`). Every table is
workspace-isolated with RLS; `create_workspace()` is the only sanctioned way
to provision a tenant. See `supabase/migrations/0001`-`0013` for the full
build and `supabase/tests/phase0_smoke_test.sql` for verification.

## Applying migrations

Migrations were applied directly to the v2 project via the Supabase MCP
`apply_migration` tool, in filename order. If working from the CLI instead:

```
supabase link --project-ref daxpavvsotvsyqqntddc
supabase db push
```
