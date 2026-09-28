import { createClient } from "@/lib/supabase/server";
import { Mail } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { EmailSmsTemplateGallery } from "@/components/settings/EmailSmsTemplateGallery";
import { Tabs } from "@/components/ui/Tabs";

export type EmailSmsTabKey = "email" | "sms";

// Split out from the old generic TemplateLibrary so /templates (which never
// renders this) doesn't pull the composer's Tiptap dependency into its bundle.
export async function EmailSmsLibrary({ workspaceId, activeTabParam }: { workspaceId: string; activeTabParam?: string }) {
  const activeTab: EmailSmsTabKey = activeTabParam === "sms" ? "sms" : "email";
  const table = activeTab === "email" ? "email_templates" : "sms_templates";

  const supabase = createClient();
  const [{ data: rows }, { data: folders }] = await Promise.all([
    supabase.from(table).select("*").eq("workspace_id", workspaceId).order("name"),
    supabase.from("library_folders").select("id, parent_folder_id, name").eq("workspace_id", workspaceId).eq("item_type", "email_sms_template").order("name"),
  ]);

  // System masters are not workspace library items. They remain protected
  // in Verexa's system/Marketplace layer. A workspace library contains only
  // rows owned by this workspace.
  const templates = rows ?? [];

  const tabs: { key: EmailSmsTabKey; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "sms", label: "SMS" },
  ];

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={Mail}
        title="Email & SMS"
        description={
          "Email and SMS templates used across the app. While editing, click \"Insert client detail\" to drop in a client's name, due date, etc. -- " +
          "no need to type anything by hand, it fills in automatically when the message sends. " +
          "Trigger/condition/action rules are not built yet -- templates are managed here for now."
        }
      />

      <div className="mt-4">
        <Tabs tabs={tabs.map((t) => ({ id: t.key, label: t.label, href: `/automations?tab=${t.key}` }))} active={activeTab} />
      </div>

      <div className="mt-4">
        <EmailSmsTemplateGallery kind={activeTab} workspaceId={workspaceId} templates={templates ?? []} folders={folders ?? []} />
      </div>
    </div>
  );
}
