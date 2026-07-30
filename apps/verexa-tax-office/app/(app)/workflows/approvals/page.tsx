import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyApprovals } from "@/features/workflows/queries";
import { MyApprovalsList } from "@/features/workflows/my-approvals-list";

export default async function MyApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const approvals = await getMyApprovals(workspaceId, user!.id);

  return (
    <div className="space-y-4">
      <Link href="/workflows" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to workflows
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">Workflow steps waiting on your sign-off.</p>
      </div>
      <MyApprovalsList approvals={approvals} />
    </div>
  );
}
