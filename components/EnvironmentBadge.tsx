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
  // Temporary broader diagnostic: VERCEL and NODE_ENV are set by the
  // platform/Next.js in every context, so if these are ALSO unset it means
  // this render path isn't seeing the Vercel runtime environment at all
  // (not just missing VERCEL_ENV specifically) -- narrows the real cause.
  const debug = [
    `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`,
    `VERCEL_TARGET_ENV=${process.env.VERCEL_TARGET_ENV ?? "unset"}`,
    `VERCEL=${process.env.VERCEL ?? "unset"}`,
    `NODE_ENV=${process.env.NODE_ENV ?? "unset"}`,
    `VERCEL_URL=${process.env.VERCEL_URL ?? "unset"}`,
  ].join(" | ");
  return (
    <span title={debug}>
      <Badge tone={TONE[env]}>{LABEL[env]}</Badge>
    </span>
  );
}
