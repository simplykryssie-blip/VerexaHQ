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
 * Always visible in the app header so staff can never mistake which
 * database/providers they're pointed at -- Production stays a quiet
 * success pill; Staging and Development use the same "needs attention"
 * warning tone the rest of the app reserves for non-normal states.
 */
export function EnvironmentBadge() {
  const env = getAppEnvironment();
  const raw = process.env.VERCEL_ENV ?? process.env.VERCEL_TARGET_ENV ?? "unset";
  return (
    <span title={`VERCEL_ENV/VERCEL_TARGET_ENV: ${raw}`}>
      <Badge tone={TONE[env]}>{LABEL[env]}</Badge>
    </span>
  );
}
