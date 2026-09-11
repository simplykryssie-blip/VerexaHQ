"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";

export type CronJobHealthRow = {
  jobKey: string;
  intervalMinutes: number;
  lastStatus: "success" | "failure" | null;
  lastRunAt: string | null;
  lastErrorMessage: string | null;
  isStale: boolean;
};

function formatInterval(minutes: number) {
  if (minutes < 60) return `~every ${minutes} min`;
  if (minutes < 1440) return `~every ${Math.round(minutes / 60)} hr`;
  return `~daily`;
}

export function CronJobHealthManager({ jobs }: { jobs: CronJobHealthRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);

  async function runNow(jobKey: string) {
    setRunning(jobKey);
    try {
      const res = await fetch("/api/platform-admin/run-cron-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.show(data.error ?? "Could not run this job.", "error");
        return;
      }
      toast.show(`Ran "${jobKey}" now`, "success");
      router.refresh();
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 font-medium">Job</th>
            <th className="px-5 py-3 font-medium">Expected</th>
            <th className="px-5 py-3 font-medium">Last run</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => (
            <tr key={job.jobKey} className="transition-colors hover:bg-surfaceMuted">
              <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">{job.jobKey}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate">{formatInterval(job.intervalMinutes)}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate">{job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}</td>
              <td className="whitespace-nowrap px-5 py-3">
                {job.isStale ? (
                  <Badge tone="danger">Stale</Badge>
                ) : job.lastStatus === "failure" ? (
                  <Badge tone="warning">Last run failed</Badge>
                ) : job.lastStatus === "success" ? (
                  <Badge tone="success">Healthy</Badge>
                ) : (
                  <Badge tone="neutral">No data</Badge>
                )}
                {job.lastErrorMessage && <p className="mt-1 max-w-xs text-xs text-muted">{job.lastErrorMessage}</p>}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <button
                  type="button"
                  onClick={() => runNow(job.jobKey)}
                  disabled={running === job.jobKey}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  <Play size={13} aria-hidden="true" />
                  {running === job.jobKey ? "Running..." : "Run now"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
