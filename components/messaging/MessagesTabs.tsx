"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";

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
      <div className="mb-4">
        <Tabs
          tabs={[
            { id: "team", label: "My team", badge: teamUnread },
            { id: "network", label: "Network", badge: networkUnread },
          ]}
          active={tab}
          onChange={(id) => setTab(id as "team" | "network")}
        />
      </div>
      <div className={tab === "team" ? "" : "hidden"}>{team}</div>
      <div className={tab === "network" ? "" : "hidden"}>{network}</div>
    </div>
  );
}
