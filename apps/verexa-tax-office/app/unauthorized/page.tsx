import { ShieldAlert } from "lucide-react";
import { StatusPage } from "@/components/status-page";

export default function UnauthorizedPage() {
  return (
    <StatusPage
      icon={ShieldAlert}
      tone="destructive"
      title="You don't have access to this"
      description="Either this workspace has been archived, or you don't have permission to view this page. Contact your workspace owner if you think this is a mistake."
      actionLabel="Back to sign in"
      actionHref="/sign-in"
    />
  );
}
