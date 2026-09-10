// One item_type per distinct list UI, not per table -- Email & SMS
// Templates (email_templates + sms_templates) share one tree since
// they're a single tab-switched page, and Form Templates
// (engagement_letter_templates + organizer_templates) share another, for
// the same reason.
export type LibraryItemType = "pipeline" | "workflow" | "website" | "email_sms_template" | "form_template";

export type LibraryFolderRow = {
  id: string;
  parent_folder_id: string | null;
  name: string;
};

// Mirrors the starred_items.entity_type CHECK constraint -- one row per
// distinct starrable list, independent of LibraryItemType since Form
// Templates covers three separate underlying tables.
export type StarEntityType =
  | "organizer_template"
  | "engagement_letter_template"
  | "document_request_template"
  | "automation"
  | "pipeline"
  | "website";
