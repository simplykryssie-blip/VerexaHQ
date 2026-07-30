import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSignatureRequestDetail } from "@/features/signatures/queries";
import { SignatureRequestPanel } from "@/features/signatures/request-panel";

export default async function SignatureRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { request, signers, events, certificate } = await getSignatureRequestDetail(id);
  if (!request) notFound();

  return (
    <div className="space-y-4">
      <Link href="/signatures" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to signatures
      </Link>
      <SignatureRequestPanel request={request} signers={signers} events={events} certificate={certificate} />
    </div>
  );
}
