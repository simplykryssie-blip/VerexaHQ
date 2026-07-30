"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { RETURN_TYPES, ENGAGEMENT_TYPES, ENGAGEMENT_PRIORITIES } from "@/lib/validation/engagements";
import { Loader2 } from "lucide-react";

export function NewEngagementForm({
  workspaceId,
  clients,
  households,
  staff,
}: {
  workspaceId: string;
  clients: PickerOption[];
  households: PickerOption[];
  staff: PickerOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);
  const [returnType, setReturnType] = useState<(typeof RETURN_TYPES)[number]>("1040");
  const [engagementType, setEngagementType] = useState<(typeof ENGAGEMENT_TYPES)[number]>("individual_return");
  const [jurisdiction, setJurisdiction] = useState("federal");
  const [preparerId, setPreparerId] = useState<string | null>(null);
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [priority, setPriority] = useState<(typeof ENGAGEMENT_PRIORITIES)[number]>("normal");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Select a client for this engagement.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    const clientLabel = clients.find((c) => c.id === clientId)?.label ?? "Client";
    const { data: engagement, error: dbError } = await supabase
      .from("tax_engagements")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        household_id: householdId,
        tax_year: taxYear,
        return_type: returnType,
        engagement_type: engagementType,
        jurisdiction,
        primary_preparer_user_id: preparerId,
        reviewer_user_id: reviewerId,
        responsible_staff_user_id: responsibleId,
        priority,
        title: `${clientLabel} — ${taxYear} ${returnType}`,
        status: "draft",
      })
      .select("id")
      .single();

    if (dbError || !engagement) {
      setError(friendlyDbError(dbError?.message));
      setSubmitting(false);
      return;
    }

    // Best-effort — if no tax_deadline_rules row matches yet, this simply
    // reports applied:false and staff set dates manually on the detail page.
    const { data: deadlineResult } = await supabase.rpc("apply_tax_deadline", { p_engagement_id: engagement.id });
    const applied = (deadlineResult as { applied?: boolean } | null)?.applied;

    setSubmitting(false);
    toast.success(applied ? "Engagement created — deadline applied automatically" : "Engagement created — set dates manually");
    router.push(`/engagements/${engagement.id}`);
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New tax engagement</CardTitle>
        <CardDescription>Intake templates and document-request templates can be attached from the engagement page once created.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Client *</Label>
            <SearchablePicker options={clients} value={clientId} onChange={setClientId} placeholder="Search clients…" />
          </div>
          <div className="space-y-1">
            <Label>Household (optional)</Label>
            <SearchablePicker options={households} value={householdId} onChange={setHouseholdId} placeholder="Search households…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tax year</Label>
              <Input type="number" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Jurisdiction</Label>
              <Input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="federal, GA…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Return type</Label>
              <Select value={returnType} onValueChange={(v) => setReturnType(v as (typeof RETURN_TYPES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Engagement type</Label>
              <Select value={engagementType} onValueChange={(v) => setEngagementType(v as (typeof ENGAGEMENT_TYPES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGAGEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Preparer</Label>
              <SearchablePicker options={staff} value={preparerId} onChange={setPreparerId} placeholder="Assign preparer…" />
            </div>
            <div className="space-y-1">
              <Label>Reviewer</Label>
              <SearchablePicker options={staff} value={reviewerId} onChange={setReviewerId} placeholder="Assign reviewer…" />
            </div>
            <div className="space-y-1">
              <Label>Responsible staff</Label>
              <SearchablePicker options={staff} value={responsibleId} onChange={setResponsibleId} placeholder="Assign staff…" />
            </div>
          </div>

          <div className="space-y-1 max-w-[160px]">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as (typeof ENGAGEMENT_PRIORITIES)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENGAGEMENT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" variant="brand" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create engagement
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
