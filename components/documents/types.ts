export type EntityType = "client" | "engagement";

export type Audience = "staff" | "portal";

export type StaffRef = { id: string; display_name: string | null } | null;

export type DocumentFolderRow = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  display_order: number;
  // Present only on the workspace-wide fetch (Document Center), which spans
  // every entity's folders in one list -- a single client/engagement's
  // Files tab already has its scope fixed and doesn't need these.
  entity_type?: EntityType;
  entity_id?: string;
};

export type DocumentRow = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  category: string | null;
  tags: string[] | null;
  version: number | null;
  folder_id: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  is_locked: boolean;
  visibility: string;
  created_at: string;
  uploaded_by: StaffRef;
  // Present when the row comes from a cross-entity list (the workspace-wide
  // Document Center) rather than a single client/engagement's Files tab,
  // where entity_type/entity_id are already fixed context.
  entity_type?: EntityType;
  entity_id?: string;
};

export type RequestItemRow = {
  id: string;
  name: string;
  is_required: boolean;
  status: "pending" | "uploaded" | "waived";
  category?: string | null;
};

export type DocumentRequestRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: "open" | "completed" | "cancelled";
  created_at: string;
  items: RequestItemRow[];
};

export type SignerRow = {
  id: string;
  signer_name: string;
  signer_email: string | null;
  status: "pending" | "signed" | "declined";
  signed_at: string | null;
  access_token: string;
  /** Staff presence/identity attestation -- see attest_signature_presence.
   *  Only populated by the staff-facing loaders; the portal never needs it. */
  attested_at?: string | null;
  attested_by_name?: string | null;
};

export type SignatureRequestRow = {
  id: string;
  title: string;
  status: "pending" | "completed" | "declined" | "cancelled";
  due_date: string | null;
  attachment_id: string | null;
  attachment_file_name: string;
  created_at: string;
  signers: SignerRow[];
};

export type ActivityRow = { id: string; description: string; created_at: string };

export type DocumentRequestTemplateOption = { id: string; name: string };

export type EngagementLetterTemplateOption = {
  id: string;
  name: string;
  body_html: string;
  banner_image_url?: string | null;
  source_type?: string;
  pdf_storage_path?: string | null;
  pdf_field_mode?: string | null;
  pdf_field_mappings?: unknown;
};
