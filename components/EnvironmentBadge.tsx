import { getEnv } from "@vercel/functions";
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
  // Temporary broader diagnostic: compares the @vercel/functions getEnv()
  // source (what Vercel's docs recommend for System Environment Variables)
  // against raw process.env side by side, since process.env alone was
  // observed unset for VERCEL_ENV/VERCEL_TARGET_ENV/even VERCEL on a real
  // Preview deployment.
  const fnEnv = getEnv();
  const debug = [
    `getEnv().VERCEL_ENV=${fnEnv.VERCEL_ENV ?? "unset"}`,
    `process.env.VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`,
    `process.env.VERCEL_TARGET_ENV=${process.env.VERCEL_TARGET_ENV ?? "unset"}`,
    `process.env.VERCEL=${process.env.VERCEL ?? "unset"}`,
    `process.env.NODE_ENV=${process.env.NODE_ENV ?? "unset"}`,
    `process.env.VERCEL_URL=${process.env.VERCEL_URL ?? "unset"}`,
  ].join(" | ");
  return (
    <span title={debug}>
      <Badge tone={TONE[env]}>{LABEL[env]}</Badge>
    </span>
  );
}
