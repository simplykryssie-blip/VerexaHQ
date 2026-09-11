"use client";

import { ClientSearchField, clientSearchResultLabel, type ClientSearchResult } from "@/components/clients/ClientSearchField";

export type ClientOption = ClientSearchResult;

export function clientOptionLabel(c: ClientOption) {
  return clientSearchResultLabel(c);
}

// Search-only existing-client picker -- unlike NewEngagementForm's client
// search, this never offers to create a new client: a quote or invoice is
// always for someone already in the system.
export function ClientPickerField({
  workspaceId,
  selected,
  onSelect,
}: {
  workspaceId: string;
  selected: ClientOption | null;
  onSelect: (client: ClientOption | null) => void;
}) {
  return (
    <ClientSearchField workspaceId={workspaceId} selected={selected} onSelect={onSelect} autoFocus />
  );
}
