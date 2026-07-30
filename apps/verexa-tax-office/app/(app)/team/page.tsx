import { createClient } from "@/lib/supabase/server";
import { InviteTeamMemberDialog } from "@/features/team/invite-dialog";
import { TeamMemberRow } from "@/features/team/member-row";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myMembership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = myMembership!.workspace_id;
  const canManage = myMembership!.role === "owner" || myMembership!.role === "admin";

  const { data: members } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, status, title, profile:user_profiles(display_name, first_name, last_name)")
    .eq("workspace_id", workspaceId)
    .neq("status", "removed")
    .order("created_at");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage roles and access for your office.</p>
        </div>
        {canManage && <InviteTeamMemberDialog workspaceId={workspaceId} />}
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {(members ?? []).map((m) => {
          const profile = m.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
          const name = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member";
          return (
            <TeamMemberRow
              key={m.id}
              memberId={m.id}
              name={name}
              email={null}
              role={m.role}
              status={m.status}
              title={m.title}
              canManage={canManage}
              isSelf={m.user_id === user!.id}
            />
          );
        })}
      </div>
    </div>
  );
}
