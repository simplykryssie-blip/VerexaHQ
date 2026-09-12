// Supabase's REST gateway occasionally 504s under load, unrelated to
// anything wrong with the query itself -- seen intermittently across
// several cron jobs (logging their own run, sweeping stale queues) as
// "Gateway Timeout" errors that show up in Vercel's error dashboard even
// though nothing is actually broken. Retrying a couple times on just that
// class of error (not on a real query/permissions error, which should
// still fail fast and loud) clears the noise without masking real bugs.
const TRANSIENT_ERROR_PATTERN = /gateway timeout|timeout|fetch failed|network|econnreset|etimedout|50[234]/i;

function isTransient(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && TRANSIENT_ERROR_PATTERN.test(error.message));
}

export async function withSupabaseRetry<T>(
  fn: () => PromiseLike<{ data: T; error: { message: string } | null }>,
  attempts = 3,
  delayMs = 400
): Promise<{ data: T; error: { message: string } | null }> {
  let result = await fn();
  for (let attempt = 1; attempt < attempts && isTransient(result.error); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    result = await fn();
  }
  return result;
}
