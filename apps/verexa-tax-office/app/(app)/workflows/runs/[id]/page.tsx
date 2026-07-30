import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkflowRunDetail } from "@/features/workflows/queries";
import { WorkflowRunDetailPanel } from "@/features/workflows/run-detail-panel";

export default async function WorkflowRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { run, steps, events, approvals, waits, jobs } = await getWorkflowRunDetail(id);
  if (!run) notFound();

  return (
    <div className="space-y-4">
      <Link href="/workflows/runs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to runs
      </Link>
      <WorkflowRunDetailPanel run={run} steps={steps} events={events} approvals={approvals} waits={waits} jobs={jobs} />
    </div>
  );
}
