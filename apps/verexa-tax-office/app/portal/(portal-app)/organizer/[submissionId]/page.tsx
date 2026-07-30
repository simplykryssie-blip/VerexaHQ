import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getIntakeSubmissionFull } from "@/features/intake/queries";
import { OrganizerForm } from "@/features/intake/organizer-form";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { intakeStatusLabel } from "@/lib/validation/intake";
import { formatDate } from "@/lib/formatters";

export default async function PortalOrganizerDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  // Reuses the exact same RLS-scoped query the staff review page uses — it
  // does no explicit client filtering itself, relying entirely on
  // can_access_intake_submission, which is the same function that already
  // limits a portal session to its own client's submissions.
  const full = await getIntakeSubmissionFull(submissionId);
  if (!full || !full.submission || full.submission.client_id !== context.client.id) notFound();

  const { submission } = full;
  const template = submission.template as { name?: string } | null;
  const metadata = (submission.metadata as { client_message?: string | null } | null) ?? {};

  return (
    <div className="space-y-4">
      <Link href="/portal/organizer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to organizers
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{template?.name ?? "Organizer"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {submission.due_date ? `Due ${formatDate(submission.due_date)}` : "No due date"}
          </p>
        </div>
        <Badge variant="secondary">{intakeStatusLabel(submission.status)}</Badge>
      </div>

      {metadata.client_message && (
        <Alert>
          <AlertDescription>{metadata.client_message}</AlertDescription>
        </Alert>
      )}

      {submission.locked_at ? (
        <Alert>
          <AlertDescription>This organizer has been approved and is locked. Contact your tax office if something needs to change.</AlertDescription>
        </Alert>
      ) : null}

      <OrganizerForm
        submissionId={submission.id}
        workspaceId={submission.workspace_id}
        status={submission.status}
        sections={full.sections}
        fields={full.fields}
        conditions={full.conditions}
        calculations={full.calculations}
        initialAnswers={full.answers}
        initialHouseholdPeople={full.household}
        initialEntities={full.entities}
        clarifications={full.comments}
        readOnly={!!submission.locked_at}
        hideStaffOnly
      />
    </div>
  );
}
