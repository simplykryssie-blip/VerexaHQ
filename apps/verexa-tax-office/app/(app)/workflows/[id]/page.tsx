import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkflowDefinitionDetail } from "@/features/workflows/queries";
import { WorkflowBuilderPanel } from "@/features/workflows/builder-panel";

export default async function WorkflowDefinitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, nodes, connections } = await getWorkflowDefinitionDetail(id);
  if (!definition) notFound();

  return (
    <div className="space-y-4">
      <Link href="/workflows" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to workflows
      </Link>
      <WorkflowBuilderPanel definition={definition} nodes={nodes} connections={connections} />
    </div>
  );
}
