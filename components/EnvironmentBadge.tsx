import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { getAppEnvironment } from "@/lib/env";

const TONE: Record<ReturnType<typeof getAppEnvironment>, BadgeTone> = {
  production: "success",
  staging: "warning",
  development: "neutral",
};

const LABEL: Record<ReturnType<typeof getAppEnvironment>, string> = {
  production: "Production",
  staging: "Staging",
  development: "Development",
};

/**
 * Visible in the app header so staff can never mistake a Staging/Development
 * session for the real thing -- those use the same "needs attention" warning
 * tone the rest of the app reserves for non-normal states. Hidden in
 * Production: that's the published CRM real staff and clients use daily, and
 * a permanent "Production" pill there is just chrome, not a warning.
 */
export function EnvironmentBadge() {
  const env = getAppEnvironment();
  if (env === "production") return null;
  return <Badge tone={TONE[env]}>{LABEL[env]}</Badge>;
}
