"use client";

import { useState, type ReactNode } from "react";

export function MessagesTabs({
  team,
  network,
  teamUnread,
  networkUnread,
}: {
  team: ReactNode;
  network: ReactNode;
  teamUnread: number;
  networkUnread: number;
}) {
  const [tab, setTab] = useState<"team" | "network">("team");

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-sm w-fit">
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
            tab === "team" ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
        >
          My team
          {teamUnread > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === "team" ? "bg-white/20" : "bg-accent text-white"}`}>{teamUnread}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("network")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
            tab === "network" ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
        >
          Network
          {networkUnread > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === "network" ? "bg-white/20" : "bg-accent text-white"}`}>
              {networkUnread}
            </span>
          )}
        </button>
      </div>
      <div className={tab === "team" ? "" : "hidden"}>{team}</div>
      <div className={tab === "network" ? "" : "hidden"}>{network}</div>
    </div>
  );
}
