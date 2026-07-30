import { Clock } from "lucide-react";
import { StatusPage } from "@/components/status-page";

export default function TrialExpiredPage() {
  return (
    <StatusPage
      icon={Clock}
      tone="warning"
      title="Your trial has ended"
      description="Your 30-day trial has ended. Upgrade your plan to keep using Verexa Tax Office — your data is safe and waiting."
      actionLabel="View plans"
      actionHref="/settings/subscription"
    />
  );
}
