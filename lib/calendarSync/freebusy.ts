import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getValidAccessToken } from "@/lib/calendarSync/tokens";
import { getGoogleFreeBusy } from "@/lib/calendarSync/google";
import { getMicrosoftSchedule } from "@/lib/calendarSync/microsoft";

/**
 * Live busy blocks pulled from every connected staff member's personal
 * Google/Outlook calendar in a workspace, for a given time window -- so a
 * client can't book a slot that's only blocked on someone's *personal*
 * calendar (a dentist appointment, a kid's recital) rather than in Verexa.
 *
 * Shaped to drop straight into filterAvailableSlots' `existing` param
 * alongside internal appointments. Deliberately fails open per-connection:
 * a token error or an unsupported provider response (e.g. getSchedule on a
 * personal Outlook.com account) just means that connection contributes no
 * extra restriction, rather than blocking booking outright.
 */
export async function getExternalBusyBlocks(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  startIso: string,
  endIso: string
): Promise<{ start_at: string; end_at: string }[]> {
  const { data: staffRows } = await supabase.from("workspace_users").select("user_id").eq("workspace_id", workspaceId).eq("status", "active");
  const staffIds = (staffRows ?? []).map((r) => r.user_id);
  if (staffIds.length === 0) return [];

  const { data: connections } = await supabase
    .from("user_calendar_connections")
    .select("user_id, provider, calendar_id, external_account_email")
    .in("user_id", staffIds)
    .eq("status", "connected");
  if (!connections || connections.length === 0) return [];

  const results = await Promise.all(
    connections.map(async (connection) => {
      const tokenResult = await getValidAccessToken(supabase, connection.user_id, connection.provider as "google" | "microsoft");
      if (!tokenResult.ok) return [];

      if (connection.provider === "google") {
        const result = await getGoogleFreeBusy({ accessToken: tokenResult.accessToken, calendarId: connection.calendar_id, startIso, endIso });
        return result.ok ? result.data : [];
      }
      if (!connection.external_account_email) return [];
      const result = await getMicrosoftSchedule({ accessToken: tokenResult.accessToken, email: connection.external_account_email, startIso, endIso });
      return result.ok ? result.data : [];
    })
  );

  return results.flat().map((block) => ({ start_at: block.start, end_at: block.end }));
}
