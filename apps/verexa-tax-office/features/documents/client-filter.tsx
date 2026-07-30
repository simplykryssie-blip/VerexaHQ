"use client";

import { useRouter } from "next/navigation";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";

export function ClientFilterForm({ clients, selectedClientId }: { clients: PickerOption[]; selectedClientId?: string }) {
  const router = useRouter();
  return (
    <SearchablePicker
      options={clients}
      value={selectedClientId ?? null}
      onChange={(id) => router.push(`/documents?client=${id}`)}
      placeholder="Filter by client…"
    />
  );
}
