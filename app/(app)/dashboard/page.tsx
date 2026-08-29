import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getDashboardData } from "@/lib/dashboard/data";
import { computeTodaysPriorities } from "@/lib/dashboard/priorities";
import { DashboardShell } from "./DashboardShell";
import type { OnboardingStep } from "@/components/onboarding/OnboardingChecklist";
import { canInviteStaff } from "@/lib/workspaceCapabilities";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  // Verexa's own workspace: platform admins/IT land straight on their
  // dashboard instead of the normal staff view -- everyone else here
  // (regular staff testing in this workspace) is unaffected.
  if (workspace.is_platform_home) {
    const [{ data: isPlatformAdmin }, { data: isPlatformIt }] = await Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.rpc("is_platform_it"),
    ]);
    if (isPlatformAdmin) redirect("/platform-admin");
    if (isPlatformIt) redirect("/platform-admin/systems");
  }

  const { data: dashboardId } = await supabase.rpc("ensure_default_dashboard", { p_workspace_id: workspace.id });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: widgets },
    data,
    { data: clientsCreate },
    { data: engagementsManage },
    { data: billingManage },
    { data: documentsRequest },
    { data: appointmentsManage },
    { data: onboardingRow },
    { data: profileRow },
  ] = await Promise.all([
    dashboardId
      ? supabase
          .from("dashboard_widgets")
          .select("id, widget_type, title, display_order, is_visible")
          .eq("dashboard_id", dashboardId)
          .order("display_order")
      : Promise.resolve({ data: [] }),
    getDashboardData(workspace.id),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "billing.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "documents.request" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "appointments.manage" }),
    supabase.from("workspaces").select("onboarding_dismissed_at, stripe_connected_account_id").eq("id", workspace.id).maybeSingle(),
    user
      ? supabase.from("user_profiles").select("seen_onboarding_steps, first_name, avatar_url").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const quickActionPermissions = {
    clientsCreate: Boolean(clientsCreate),
    engagementsManage: Boolean(engagementsManage),
    billingManage: Boolean(billingManage),
    documentsRequest: Boolean(documentsRequest),
    appointmentsManage: Boolean(appointmentsManage),
  };

  const widgetIds = (widgets ?? []).map((w) => w.id);
  const { data: preferences } =
    user && widgetIds.length > 0
      ? await supabase
          .from("user_widget_preferences")
          .select("dashboard_widget_id, is_visible, display_order")
          .eq("user_id", user.id)
          .in("dashboard_widget_id", widgetIds)
      : { data: [] as { dashboard_widget_id: string; is_visible: boolean | null; display_order: number | null }[] };
  const prefByWidget = new Map((preferences ?? []).map((p) => [p.dashboard_widget_id, p]));

  const mergedWidgets = (widgets ?? []).map((w) => {
    const pref = prefByWidget.get(w.id);
    return {
      ...w,
      is_visible: pref?.is_visible ?? w.is_visible,
      display_order: pref?.display_order ?? w.display_order,
    };
  });

  const priorities = computeTodaysPriorities(data);

  const onboardingDismissed = Boolean(onboardingRow?.onboarding_dismissed_at);
  let onboardingSteps: OnboardingStep[] = [];
  if (!onboardingDismissed) {
    const showEroSteps = canInviteStaff(workspace);
    const [
      { count: organizerCount },
      { count: processCount },
      { count: staffCount },
      { count: pendingInviteCount },
      { count: automationCount },
      { count: customRoleCount },
      { count: connectionCount },
      { count: securityPolicyCount },
    ] = await Promise.all([
      supabase.from("organizer_templates").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
      supabase.from("processes").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
      showEroSteps
        ? supabase.from("workspace_users").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id)
        : Promise.resolve({ count: null }),
      showEroSteps
        ? supabase
            .from("workspace_invitations")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
            .eq("status", "pending")
        : Promise.resolve({ count: null }),
      supabase.from("automations").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
      showEroSteps
        ? supabase.from("roles").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("is_system_role", false)
        : Promise.resolve({ count: null }),
      showEroSteps
        ? supabase.from("firm_connections").select("id", { count: "exact", head: true }).eq("parent_workspace_id", workspace.id)
        : Promise.resolve({ count: null }),
      supabase.from("workspace_security_policies").select("workspace_id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    ]);

    // A photo is nice-to-have, not a gate -- a name is enough to call the profile "done".
    // Check first_name, not display_name -- display_name silently defaults to the user's
    // email at signup (handle_new_auth_user()), so it's always truthy and can't signal
    // real completion. first_name is only set when the user actually provided one.
    const profileComplete = Boolean(profileRow?.first_name);

    onboardingSteps = [
      {
        key: "profile",
        label: "Complete your profile",
        description: "Add your name and a photo so colleagues recognize you in messages.",
        href: "/settings/firm-profile",
        complete: profileComplete,
      },
      ...(showEroSteps
        ? [
            {
              key: "roles",
              label: "Set roles & permissions",
              description: "Control what each role on your team can see and do.",
              href: "/settings/roles",
              complete: (customRoleCount ?? 0) > 0,
            },
          ]
        : []),
      {
        key: "integrations",
        label: "Set up integrations",
        description: "Connect Stripe to get paid and Zoom for client meetings.",
        href: "/settings/integrations",
        complete: Boolean(onboardingRow?.stripe_connected_account_id),
      },
      {
        key: "security",
        label: "Review your security setup",
        description: "Set a password policy and turn on two-factor authentication for your own account.",
        href: "/settings/security",
        complete: (securityPolicyCount ?? 0) > 0,
      },
      ...(showEroSteps
        ? [
            {
              key: "invite",
              label: "Add staff",
              description: "Add staff so they can share the workload.",
              href: "/settings/users",
              complete: (staffCount ?? 0) > 1 || (pendingInviteCount ?? 0) > 0,
            },
            {
              key: "connections",
              label: "Send connection invites",
              description: "Invite the PTINs you work with to connect to your ERO.",
              href: "/settings/connections",
              complete: (connectionCount ?? 0) > 0,
            },
          ]
        : []),
      {
        key: "organizer",
        label: "Add or create organizers",
        description: "Build the questions clients answer before you start their work.",
        href: "/templates",
        complete: (organizerCount ?? 0) > 0,
      },
      {
        key: "pipeline",
        label: "Create a pipeline",
        description: "Build the stages a piece of work moves through, from intake to delivered.",
        href: "/pipelines",
        complete: (processCount ?? 0) > 0,
      },
      {
        key: "automations",
        label: "Create your automations",
        description: "Decide what happens automatically -- welcome emails, sending an organizer, moving a client into a pipeline.",
        href: "/workflows",
        complete: (automationCount ?? 0) > 0,
      },
    ];
  }

  return (
    <DashboardShell
      workspaceName={workspace.name}
      firstName={profileRow?.first_name ?? null}
      isAdmin={workspace.is_owner}
      widgets={mergedWidgets}
      data={data}
      priorities={priorities}
      quickActionPermissions={quickActionPermissions}
      workspaceId={workspace.id}
      onboardingSteps={onboardingDismissed ? null : onboardingSteps}
      seenOnboardingSteps={profileRow?.seen_onboarding_steps ?? []}
    />
  );
}
