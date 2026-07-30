import type { Enums } from "@/types/database";

type RelationshipType = Enums<"relationship_type">;
type RelationshipStatus = Enums<"relationship_status">;

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  service_bureau_to_ero: "Service bureau → ERO",
  ero_to_preparer: "ERO → Preparer",
  ptin_to_ero: "PTIN holder → ERO",
};

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
  declined: "Declined",
};

export const RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_TYPE_LABELS) as [RelationshipType, ...RelationshipType[]];

export function relationshipTypeLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (RELATIONSHIP_TYPE_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function relationshipStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (RELATIONSHIP_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
