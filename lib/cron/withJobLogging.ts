import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { reportSystemFailure } from "@/lib/systemFailures";

// Wraps a cron route's GET handler so every run -- success or failure --
// leaves a row in cron_job_runs (job_key, status, duration). That's what
// lets the Systems dashboard show "last run" per job and lets
// check-stale-cron-jobs detect a cron that's stopped firing entirely,
// which nothing previously watched for (the existing stale-queue checks
// only catch a cron that's still running but not draining its queue).
//
// Most routes here don't throw on a query/send failure -- they log to
// console and return 200 with an error-ish field instead (so one bad row
// doesn't 500 the whole batch). To actually catch those as failures too,
// this also inspects the JSON body for a handful of conventional
// error-carrying keys already in use across these routes.
const ERROR_BODY_KEYS = ["error", "queryError", "sendError", "markError"] as const;

function extractErrorFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  for (const key of ERROR_BODY_KEYS) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function withJobLogging(jobKey: string, handler: (request: Request) => Promise<Response>) {
  return async function wrapped(request: Request): Promise<Response> {
    const startedAt = new Date();
    const supabase = createServiceClient();

    const logRun = async (status: "success" | "failure", errorMessage: string | null) => {
      const completedAt = new Date();
      const { error } = await supabase.from("cron_job_runs").insert({
        job_key: jobKey,
        status,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAt.getTime(),
        error_message: errorMessage,
      });
      if (error) console.error(`withJobLogging(${jobKey}): could not log run`, error);
    };

    try {
      const response = await handler(request);

      // Unauthorized (missing/wrong CRON_SECRET) isn't a job failure worth
      // alerting IT about -- it's either Vercel's own probe or a
      // misconfigured secret, already visible another way.
      if (response.status === 401) return response;

      let bodyErrorMessage: string | null = null;
      try {
        bodyErrorMessage = extractErrorFromBody(await response.clone().json());
      } catch {
        // Non-JSON body -- nothing to inspect.
      }

      if (!response.ok || bodyErrorMessage) {
        const message = bodyErrorMessage ?? `HTTP ${response.status}`;
        await logRun("failure", message);
        await reportSystemFailure(`cron:${jobKey}`, `Cron job "${jobKey}" reported a failure: ${message}`);
      } else {
        await logRun("success", null);
      }

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logRun("failure", message);
      await reportSystemFailure(`cron:${jobKey}`, `Cron job "${jobKey}" threw an uncaught error: ${message}`);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
