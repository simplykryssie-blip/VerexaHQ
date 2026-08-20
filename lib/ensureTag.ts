import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checks a tag name against the workspace's tag registry before it gets
 * saved anywhere -- an automation's add_tag/remove_tag action, a
 * client.tags condition, a client.tag_added trigger, or the free-text tag
 * field on a client's profile. If the name is already registered this is a
 * silent no-op (returns true immediately -- reusing an existing tag every
 * day shouldn't mean a confirmation dialog every day). If it's new, confirms
 * with the user before registering it, so a typo doesn't silently become a
 * permanent new tag no one meant to create.
 *
 * Returns false (abort the caller's save) if the name is empty, the user
 * declines, or registration fails.
 */
export async function ensureTagConfirmed(supabase: SupabaseClient, workspaceId: string, rawName: string): Promise<boolean> {
  const name = rawName.trim();
  if (!name) return true;

  const { data: existing } = await supabase.from("workspace_tags").select("id").eq("workspace_id", workspaceId).eq("name", name).maybeSingle();
  if (existing) return true;

  if (!window.confirm(`"${name}" isn't a tag yet -- create it?`)) return false;

  const { error } = await supabase.rpc("create_workspace_tag", { p_workspace_id: workspaceId, p_name: name });
  if (error) {
    window.alert(error.message);
    return false;
  }
  return true;
}

/** Collects every distinct client.tags value out of a Condition[] array, for
 * checking a whole batch (an automation's trigger conditions, or every
 * branch's conditions) in one pass before saving. */
export function collectClientTagValues(conditions: { field: string; value: string }[]): string[] {
  return [...new Set(conditions.filter((c) => c.field === "client.tags" && c.value.trim()).map((c) => c.value.trim()))];
}
