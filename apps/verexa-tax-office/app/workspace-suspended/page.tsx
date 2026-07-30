import { PauseCircle } from "lucide-react";
import { StatusPage } from "@/components/status-page";

export default function WorkspaceSuspendedPage() {
  return (
    <StatusPage
      icon={PauseCircle}
      tone="warning"
      title="This workspace is suspended"
      description="Access to this workspace has been temporarily suspended. Contact your workspace owner or Verexa support to resolve this."
      actionLabel="Back to sign in"
      actionHref="/sign-in"
    />
  );
}
