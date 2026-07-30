import Link from "next/link";
import {
  UsersRound,
  Users,
  Briefcase,
  Clock,
  Eye,
  AlarmClock,
  CalendarClock,
  Wallet,
  TrendingUp,
  Plus,
  FileText,
  ClipboardList,
  CheckSquare,
  CalendarPlus,
  Receipt,
  PenTool,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/features/dashboard/queries";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, titleCase } from "@/lib/formatters";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspace:workspaces(name)")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id;
  const workspaceName = (membership?.workspace as { name?: string } | null)?.name;

  if (!workspaceId) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No workspace found"
        description="Something went wrong resolving your workspace."
      />
    );
  }

  const { summary, workQueue, missingDocs } = await getDashboardData(workspaceId);

  const cards = [
    { label: "New leads", value: summary?.open_leads ?? 0, icon: UsersRound, href: "/leads" },
    { label: "Active clients", value: summary?.active_clients ?? 0, icon: Users, href: "/clients" },
    { label: "Open engagements", value: summary?.open_engagements ?? 0, icon: Briefcase, href: "/engagements" },
    {
      label: "Waiting on clients",
      value: summary?.waiting_on_clients ?? 0,
      icon: Clock,
      href: "/work-queue?filter=waiting_on_clients",
      tone: "warning" as const,
    },
    {
      label: "Awaiting review",
      value: summary?.awaiting_review ?? 0,
      icon: Eye,
      href: "/work-queue?filter=awaiting_review",
    },
    {
      label: "Overdue tasks",
      value: summary?.overdue_tasks ?? 0,
      icon: AlarmClock,
      href: "/tasks?filter=overdue",
      tone: "destructive" as const,
    },
    {
      label: "Appointments today",
      value: summary?.appointments_today ?? 0,
      icon: CalendarClock,
      href: "/calendar",
    },
    {
      label: "Outstanding balance",
      value: formatCurrency(summary?.outstanding_balance),
      icon: Wallet,
      href: "/invoices?filter=outstanding",
      tone: "warning" as const,
    },
    {
      label: "Revenue YTD",
      value: formatCurrency(summary?.revenue_ytd),
      icon: TrendingUp,
      href: "/reports/revenue",
      tone: "success" as const,
    },
  ];

  const quickActions = [
    { label: "Add lead", href: "/leads/new", icon: Plus },
    { label: "Add client", href: "/clients/new", icon: Users },
    { label: "Create engagement", href: "/engagements/new", icon: Briefcase },
    { label: "Send intake", href: "/intake", icon: FileText },
    { label: "Request documents", href: "/document-requests/new", icon: ClipboardList },
    { label: "Create task", href: "/tasks/new", icon: CheckSquare },
    { label: "Schedule appointment", href: "/calendar?new=1", icon: CalendarPlus },
    { label: "Create invoice", href: "/invoices/new", icon: Receipt },
    { label: "Send signature request", href: "/signatures/new", icon: PenTool },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {workspaceName ? `${workspaceName} — ` : ""}
          Signed in as {user?.email}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>My work queue</CardTitle>
            <Link href="/work-queue" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {workQueue.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No open engagements"
                description="Create your first tax engagement to see it here."
                actionLabel="Create engagement"
                actionHref="/engagements/new"
              />
            ) : (
              <div className="divide-y divide-border">
                {workQueue.map((e) => (
                  <Link
                    key={e.id}
                    href={`/engagements/${e.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-accent/50 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{e.client_name ?? e.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {e.engagement_number} · {e.tax_year} · {titleCase(e.return_type ?? undefined)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!!e.missing_document_count && Number(e.missing_document_count) > 0 && (
                        <Badge variant="warning">{e.missing_document_count} missing</Badge>
                      )}
                      <Badge variant="secondary">{titleCase(e.status ?? undefined)}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-1.5">
              {quickActions.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <a.icon className="h-4 w-4 text-primary" />
                  {a.label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Missing document aging</CardTitle>
          <Link href="/document-requests" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {missingDocs.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No missing documents" description="Nothing outstanding right now." />
          ) : (
            <div className="divide-y divide-border">
              {missingDocs.map((d, i) => (
                <div key={d.document_request_id ?? i} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    Requested {formatDate(d.created_at)} · {d.outstanding_items} item(s) outstanding
                  </span>
                  <Badge variant={Number(d.age_days) > 14 ? "destructive" : "warning"}>{d.age_days} days</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
