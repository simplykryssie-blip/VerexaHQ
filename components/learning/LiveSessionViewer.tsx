"use client";

import { useEffect, useState } from "react";
import { Video, Radio } from "lucide-react";

// Join opens 10 minutes before the scheduled start -- matches how the rest
// of the app treats "starting soon" (the reminder cron fires at 1 hour out;
// this is the tighter window for the button itself, not a duplicate signal).
const JOIN_WINDOW_MS = 10 * 60 * 1000;

function formatCountdown(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function LiveSessionViewer({
  scheduledStart,
  durationMinutes,
  isWebinar,
  joinUrl,
}: {
  scheduledStart: string;
  durationMinutes: number;
  isWebinar: boolean;
  joinUrl: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const startMs = new Date(scheduledStart).getTime();
  const endMs = startMs + durationMinutes * 60_000;
  const joinsAt = startMs - JOIN_WINDOW_MS;
  const ended = now > endMs;
  const canJoin = now >= joinsAt && !ended;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accentSoft text-accent">
        {isWebinar ? <Radio size={22} /> : <Video size={22} />}
      </div>
      <p className="text-sm font-medium text-ink">{isWebinar ? "Live webinar" : "Live session"}</p>
      <p className="mt-1 text-sm text-muted">
        {new Date(scheduledStart).toLocaleString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
        {" -- "}
        {durationMinutes} min
      </p>

      {ended ? (
        <p className="mt-4 text-sm text-muted">This session has ended.</p>
      ) : canJoin ? (
        <a
          href={joinUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
        >
          {isWebinar ? <Radio size={15} /> : <Video size={15} />}
          Join now
        </a>
      ) : (
        <p className="mt-4 text-sm text-muted">Join opens in {formatCountdown(joinsAt - now)}</p>
      )}
    </div>
  );
}
