import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MemberFormDialog } from "@/features/households/member-form-dialog";
import { RemoveMemberButton } from "@/features/households/remove-member-button";
import { formatDate } from "@/lib/formatters";

export default async function HouseholdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: household }, { data: members }, { data: engagements }] = await Promise.all([
    supabase.from("tax_households").select("*").eq("id", id).maybeSingle(),
    supabase.from("household_members").select("*").eq("household_id", id).order("sort_order"),
    supabase.from("tax_engagements").select("id, engagement_number, tax_year, status").eq("household_id", id),
  ]);

  if (!household) notFound();

  const primary = (members ?? []).find((m) => m.is_primary_taxpayer);
  const spouse = (members ?? []).find((m) => m.is_spouse);
  const dependents = (members ?? []).filter((m) => m.is_dependent);
  const others = (members ?? []).filter((m) => !m.is_primary_taxpayer && !m.is_spouse && !m.is_dependent);

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/households" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to households
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{household.household_name}</h1>
        <MemberFormDialog householdId={household.id} workspaceId={household.workspace_id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primary taxpayer &amp; spouse</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MemberCard label="Primary taxpayer" member={primary} />
          <MemberCard label="Spouse" member={spouse} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dependents ({dependents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {dependents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dependents added yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {dependents.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">
                      {m.first_name} {m.last_name}
                    </span>{" "}
                    <span className="text-muted-foreground">· {m.relationship} · {formatDate(m.date_of_birth)}</span>
                  </div>
                  <RemoveMemberButton memberId={m.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Other household members</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {others.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {m.first_name} {m.last_name} · {m.relationship}
                  </span>
                  <RemoveMemberButton memberId={m.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Household tax engagements</CardTitle>
        </CardHeader>
        <CardContent>
          {!engagements || engagements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No engagements linked to this household.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {engagements.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <Link href={`/engagements/${e.id}`} className="hover:underline">
                    {e.engagement_number} · {e.tax_year}
                  </Link>
                  <Badge variant="secondary">{String(e.status).replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberCard({ label, member }: { label: string; member: { first_name: string; last_name: string; date_of_birth: string | null } | undefined }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {member ? (
        <>
          <div className="font-medium">
            {member.first_name} {member.last_name}
          </div>
          <div className="text-xs text-muted-foreground">DOB: {formatDate(member.date_of_birth)}</div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">Not set</div>
      )}
    </div>
  );
}
