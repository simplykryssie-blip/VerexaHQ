// Full dashboard (cards, work queue, charts, quick actions) lands in
// Phase 2 — this placeholder is intentionally minimal, not mocked: it
// reads the real signed-in workspace context, nothing fabricated.
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Signed in as {user?.email}. The full office dashboard (work queue, revenue, missing documents,
        deadlines) is coming next in this build.
      </p>
    </div>
  );
}
