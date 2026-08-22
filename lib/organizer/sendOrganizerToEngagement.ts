import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail } from "@/lib/email/template";

export async function sendOrganizerToEngagement({
  supabase,
  workspaceId,
  clientId,
  engagementId,
  template,
  primaryEmail,
  appUrl,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  clientId: string;
  engagementId: string;
  template: { id: string; name: string };
  primaryEmail: string | null;
  appUrl: string;
}): Promise<string | undefined> {
  const { error } = await supabase.from("organizer_responses").insert({
    workspace_id: workspaceId,
    client_id: clientId,
    engagement_id: engagementId,
    organizer_template_id: template.id,
  });
  if (error) return error.message;

  if (primaryEmail) {
    await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: primaryEmail,
        sender: "notifications",
        subject: `New organizer to complete: ${template.name}`,
        html: renderEmail({
          heading: "An organizer is ready for you",
          bodyHtml: `<p>Please log in to your client portal and complete the <strong>${template.name}</strong> when you have a chance.</p>`,
          ctaLabel: "Go to portal",
          ctaUrl: `${appUrl}/portal/organizer`,
        }),
      }),
    });
  }
  return undefined;
}
