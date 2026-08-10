import type { OrganizerFieldType } from "@/lib/organizer/fieldTypes";

export type BuilderField = {
  id: string;
  organizer_template_id: string;
  parent_field_id: string | null;
  field_type: OrganizerFieldType;
  label: string;
  help_text: string | null;
  display_order: number;
  is_required: boolean;
  options: unknown;
  conditional_logic: unknown;
};

export type BuilderTemplate = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  workspace_id: string | null;
  public_token: string;
  is_public: boolean;
};
