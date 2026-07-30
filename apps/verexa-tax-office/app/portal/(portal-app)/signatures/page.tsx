import Link from "next/link";
import { redirect } from "next/navigation";
import { PenTool } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getSignatureRequests } from "@/features/signatures/queries";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { signatureRequestStatusLabel } from "@/lib/validation/signatures";
import { formatDate } from "@/lib/formatters";

export default async function PortalSignaturesPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const requests = await getSignatureRequests(context.client.workspace_id, { clientId: context.client.id });
  const visible = requests.filter((r) => r.status !== "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signatures</h1>
        <p className="text-sm text-muted-foreground mt-1">Documents that need — or have received — your signature. Signing links are emailed separately.</p>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={PenTool} title="Nothing to sign" description="Signature requests from your tax office will appear here." />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const signers = (r.signers as { id: string; status: string }[] | null) ?? [];
            const signedCount = signers.filter((s) => s.status === "signed").length;
            return (
              <Link key={r.id} href={`/portal/signatures/${r.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {signedCount} of {signers.length} signed
                        {r.expires_at ? ` · Expires ${formatDate(r.expires_at)}` : ""}
                      </p>
                    </div>
                    <Badge variant={r.status === "completed" ? "success" : r.status === "declined" || r.status === "expired" ? "destructive" : "secondary"}>
                      {signatureRequestStatusLabel(r.status)}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
