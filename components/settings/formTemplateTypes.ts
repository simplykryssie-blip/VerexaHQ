// Shared row shapes for the Form Templates list (components/settings/FormTemplateLibraryList.tsx).
// Split out on its own so nothing needs to import a client component just to
// get the type its server-side data-fetching code builds.

export type OrganizerCard = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  workspace_id: string | null;
  topLevelFieldCount: number;
  totalFieldCount: number;
  hasSignature: boolean;
};

export type EngagementLetterCard = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  requires_signature: boolean;
  merge_field_count: number;
};
