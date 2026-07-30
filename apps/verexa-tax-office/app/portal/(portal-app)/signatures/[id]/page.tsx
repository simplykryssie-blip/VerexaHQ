import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getSignatureRequestDetail } from "@/features/signatures/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signatureRequestStatusLabel, signerStatusLabel } from "@/lib/validation/signatures";
import { formatDate, formatDateTime } from "@/lib/formatters";

export default async function PortalSignatureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const { request, signers, events } = await getSignatureRequestDetail(id);
  if (!request || request.client_id !== context.client.id) notFound();

  return (
    <div className="space-y-4">
      <Link href="/portal/signatures" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to signatures
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{request.title}</CardTitle>
            {request.expires_at && <p className="text-xs text-muted-foreground mt-1">Expires {formatDate(request.expires_at)}</p>}
          </div>
          <Badge variant={request.status === "completed" ? "success" : request.status === "declined" || request.status === "expired" ? "destructive" : "secondary"}>
            {signatureRequestStatusLabel(request.status)}
          </Badge>
        </CardHeader>
        {request.message && (
          <CardContent>
            <p className="text-sm">{request.message}</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {signers.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
              <div>
                <p className="font-medium">{s.name}</p>
                {s.signed_at && <p className="text-xs text-muted-foreground">Signed {formatDateTime(s.signed_at)}</p>}
              </div>
              <Badge variant={s.status === "signed" ? "success" : s.status === "declined" ? "destructive" : "secondary"}>{signerStatusLabel(s.status)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded bg-secondary px-2 py-1.5">
                  <span>{e.event_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{formatDateTime(e.event_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
