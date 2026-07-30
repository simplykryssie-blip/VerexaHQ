import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntakeSubmissionFull } from "@/features/intake/queries";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { OrganizerForm } from "@/features/intake/organizer-form";
import { IntakeReviewPanel } from "@/features/intake/review-panel";
import { intakeStatusLabel, INTAKE_REVISION_REASON_LABELS } from "@/lib/validation/intake";
import { formatDate, formatDateTime } from "@/lib/formatters";

export default async function IntakeSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const [full, membership] = await Promise.all([getIntakeSubmissionFull(submissionId), getActiveWorkspace()]);

  if (!full || !membership) notFound();

  const { submission, sections, fields, conditions, calculations, answers, household, entities, incomeSources, deductions, reviewSections, comments, validationResults, revisions } =
    full;
  const client = submission.client as { id: string; first_name?: string; last_name?: string; company?: string } | null;
  const template = submission.template as { id: string; name?: string } | null;
  const clientVisibleComments = comments.filter((c) => c.is_client_visible);
  const readOnly = submission.locked_at !== null;

  return (
    <div className="space-y-4">
      <Link href="/intake" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to intake organizers
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "Intake organizer"}
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {template?.name} · Tax year {submission.tax_year ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{intakeStatusLabel(submission.status)}</Badge>
          {readOnly && <Badge variant="outline">Locked</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Progress" value={`${Math.round(Number(submission.progress_percent ?? 0))}%`} />
        <MiniStat label="Due date" value={formatDate(submission.due_date)} />
        <MiniStat label="Submitted" value={formatDate(submission.submitted_at)} />
        <MiniStat label="Revision" value={String(submission.revision_number)} />
      </div>

      <Tabs defaultValue="organizer">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="organizer">Organizer</TabsTrigger>
          <TabsTrigger value="review">Staff review</TabsTrigger>
          <TabsTrigger value="income">Income &amp; deductions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="organizer">
          <OrganizerForm
            submissionId={submission.id}
            workspaceId={submission.workspace_id}
            status={submission.status}
            sections={sections}
            fields={fields}
            conditions={conditions}
            calculations={calculations}
            initialAnswers={answers}
            initialHouseholdPeople={household}
            initialEntities={entities}
            clarifications={clientVisibleComments}
            readOnly={readOnly}
          />
        </TabsContent>

        <TabsContent value="review">
          <IntakeReviewPanel submission={submission} sections={sections} reviewSections={reviewSections} comments={comments} />
          {validationResults.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Latest validation results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {validationResults.map((v) => (
                  <div key={v.id} className="text-sm flex items-center justify-between rounded-md border border-border p-2">
                    <span>{v.message}</span>
                    <Badge variant={v.severity === "error" ? "destructive" : "secondary"}>{v.severity}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="income">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Income sources tracked</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {incomeSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No income sources recorded for reconciliation yet.</p>
                ) : (
                  incomeSources.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                      <div>
                        <div className="font-medium">{i.payer_name || i.income_type}</div>
                        <div className="text-xs text-muted-foreground">{i.income_type.replace(/_/g, " ")}</div>
                      </div>
                      <Badge variant={i.document_received ? "success" : "warning"}>{i.document_received ? "Document received" : "Awaiting document"}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deductions &amp; credits tracked</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deductions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No deductions or credits recorded for reconciliation yet.</p>
                ) : (
                  deductions.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                      <div className="font-medium">{d.item_type.replace(/_/g, " ")}</div>
                      <Badge variant={d.document_received ? "success" : "warning"}>{d.document_received ? "Document received" : "Awaiting document"}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revision history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {revisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No revisions recorded yet.</p>
              ) : (
                revisions.map((r) => (
                  <details key={r.id} className="rounded-md border border-border p-2 text-sm">
                    <summary className="cursor-pointer flex items-center justify-between">
                      <span>
                        Revision {r.revision_number} · {INTAKE_REVISION_REASON_LABELS[r.reason] ?? r.reason}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                    </summary>
                    {r.reason_details && <p className="text-xs text-muted-foreground mt-2">{r.reason_details}</p>}
                  </details>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
