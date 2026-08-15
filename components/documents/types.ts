export type EntityType = "client" | "engagement";

export type Audience = "staff" | "portal";

export type StaffRef = { id: string; display_name: string | null } | null;

export type DocumentFolderRow = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  display_order: number;
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
};

export type SignatureRequestRow = {
  id: string;
  title: string;
  status: "pending" | "completed" | "declined" | "cancelled";
  due_date: string | null;
  /** Null for a signature produced by a combined organizer+letter template
   *  sign-off, which has no pre-existing document to attach -- the signed
   *  snapshot lives in signature_request_signers.resolved_document_html
   *  instead. Every row shown in this list today still comes from an
   *  attachment join, so this stays non-null in practice here; it's typed
   *  loosely to match the underlying column. */
  attachment_id: string | null;
  attachment_file_name: string;
  created_at: string;
  signers: SignerRow[];
};

export type ActivityRow = { id: string; description: string; created_at: string };

export type DocumentRequestTemplateOption = { id: string; name: string };

export type EngagementLetterTemplateOption = { id: string; name: string; body_html: string };
