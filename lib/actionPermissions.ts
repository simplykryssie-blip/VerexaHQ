import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionPermissions = {
  documentsUpload: boolean;
  documentsRequest: boolean;
  signaturesRequest: boolean;
  billingManage: boolean;
  messagesSend: boolean;
  messagesInternalNote: boolean;
  engagementsManage: boolean;
  clientsEditSensitive: boolean;
};

// Centralizes the has_permission lookups QuickActions needs to hide (not
// just RLS-reject) actions a role can't perform -- one round of RPCs per
// page load, reused by both the client- and engagement-level QuickActions.
export async function loadActionPermissions(supabase: SupabaseClient, workspaceId: string): Promise<ActionPermissions> {
  const [
    { data: documentsUpload },
    { data: documentsRequest },
    { data: signaturesRequest },
    { data: billingManage },
    { data: messagesSend },
    { data: messagesInternalNote },
    { data: engagementsManage },
    { data: clientsEditSensitive },
  ] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "documents.upload" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "documents.request" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "signatures.request" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "billing.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "messages.send" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "messages.internal_note" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "engagements.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspaceId, p_permission_key: "clients.edit_sensitive" }),
  ]);

  return {
    documentsUpload: Boolean(documentsUpload),
    documentsRequest: Boolean(documentsRequest),
    signaturesRequest: Boolean(signaturesRequest),
    billingManage: Boolean(billingManage),
    messagesSend: Boolean(messagesSend),
    messagesInternalNote: Boolean(messagesInternalNote),
    engagementsManage: Boolean(engagementsManage),
    clientsEditSensitive: Boolean(clientsEditSensitive),
  };
}
