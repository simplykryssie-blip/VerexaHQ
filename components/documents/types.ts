export type EntityType = "client" | "engagement";

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
};

export type SignatureRequestRow = {
  id: string;
  title: string;
  status: "pending" | "completed" | "declined" | "cancelled";
  due_date: string | null;
  attachment_id: string;
  attachment_file_name: string;
  created_at: string;
  signers: SignerRow[];
};

export type ActivityRow = { id: string; description: string; created_at: string };

export type DocumentRequestTemplateOption = { id: string; name: string };
