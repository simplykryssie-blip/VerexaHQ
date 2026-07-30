import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getTemplates } from "@/features/templates/queries";
import { NewTemplateDialog } from "@/features/templates/new-template-dialog";
import { TEMPLATE_KIND_LABELS, templateKindLabel, templateStatusLabel } from "@/lib/validation/templates";
import { formatDate } from "@/lib/formatters";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
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

  const templates = await getTemplates(workspaceId, { kind });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Forms, document requests, engagement letters, messages, and workflow definitions.</p>
        </div>
        <NewTemplateDialog workspaceId={workspaceId} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant={!kind ? "secondary" : "ghost"} size="sm">
          <Link href="/templates">All</Link>
        </Button>
        {Object.entries(TEMPLATE_KIND_LABELS).map(([v, l]) => (
          <Button asChild key={v} variant={kind === v ? "secondary" : "ghost"} size="sm">
            <Link href={`/templates?kind=${v}`}>{l}</Link>
          </Button>
        ))}
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No templates yet" description="Create a template to standardize how your office works." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/templates/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    {t.is_system_template && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        System
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{templateKindLabel(t.kind)}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === "published" ? "success" : t.status === "archived" ? "destructive" : "secondary"}>{templateStatusLabel(t.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(t.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
