import { notFound } from "next/navigation";
import { ClientWorkspace } from "./ClientWorkspace";
import { getClientWorkspaceData } from "./getClientWorkspaceData";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const data = await getClientWorkspaceData(params.id);
  if (!data) notFound();

  return <ClientWorkspace {...data} />;
}
