"use client";

import { useState } from "react";
import { CalendarView, type CalendarItem } from "./CalendarView";
import { AppointmentsToolbar, type AppointmentFilter } from "@/components/appointments/AppointmentsToolbar";
import { AppointmentsList } from "@/components/appointments/AppointmentsList";
import type { AppointmentRow, ClientOption, EngagementOption, StaffOption } from "@/components/appointments/types";

// The appointments toolbar (filter tabs + New appointment) sits above the
// month grid so it's reachable without scrolling past it; the filtered
// list stays below the grid. `filter` is the only state the toolbar and
// list actually share, so it's lifted here rather than in either of them.
export function CalendarPageClient({
  workspaceId,
  items,
  appointments,
  clients,
  engagements,
  staff,
  staffTimeOff,
  canManage,
  currentUserId,
}: {
  workspaceId: string;
  items: CalendarItem[];
  appointments: AppointmentRow[];
  clients: ClientOption[];
  engagements: EngagementOption[];
  staff: StaffOption[];
  staffTimeOff: { user_id: string; start_date: string; end_date: string }[];
  canManage: boolean;
  currentUserId: string | null;
}) {
  const [filter, setFilter] = useState<AppointmentFilter>("upcoming");

  return (
    <div className="space-y-6">
      <AppointmentsToolbar
        workspaceId={workspaceId}
        clients={clients}
        engagements={engagements}
        staff={staff}
        staffTimeOff={staffTimeOff}
        canManage={canManage}
        currentUserId={currentUserId}
        filter={filter}
        onFilterChange={setFilter}
      />
      <CalendarView items={items} />
      <AppointmentsList appointments={appointments} filter={filter} canManage={canManage} />
    </div>
  );
}
