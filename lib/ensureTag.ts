import type { SupabaseClient } from "@supabase/supabase-js";

/** A page-rendered confirm (see components/Confirm.tsx), not window.confirm --
 * native dialogs render outside the page and can be silently suppressed by
 * the browser after repeated use in one tab, which looks identical to the
 * caller as a normal decline. */
type ConfirmFn = (options: { title: string; body?: string; confirmLabel?: string }) => Promise<boolean>;
/** How a registration failure (the RPC call, not the confirm step) reaches the user. */
type NotifyErrorFn = (message: string) => void;

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
 * declines, or registration fails. A declined confirm is meant to be a
 * silent no-op for the caller; a registration failure is reported through
 * notifyError so it's never indistinguishable from a decline.
 */
export async function ensureTagConfirmed(
  supabase: SupabaseClient,
  workspaceId: string,
  rawName: string,
  confirm: ConfirmFn,
  notifyError: NotifyErrorFn
): Promise<boolean> {
  const name = rawName.trim();
  if (!name) return true;

  const { data: existing } = await supabase.from("workspace_tags").select("id").eq("workspace_id", workspaceId).eq("name", name).maybeSingle();
  if (existing) return true;

  const confirmed = await confirm({
    title: `Create tag "${name}"?`,
    body: `"${name}" isn't a tag yet in this workspace.`,
    confirmLabel: "Create tag",
  });
  if (!confirmed) return false;

  const { error } = await supabase.rpc("create_workspace_tag", { p_workspace_id: workspaceId, p_name: name });
  if (error) {
    notifyError(error.message);
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

/**
 * Same job as ensureTagConfirmed, but for a whole batch of tag names at
 * once (a multi-tag trigger/action, or several condition values gathered
 * together) -- one combined confirmation naming every tag that doesn't
 * exist yet, instead of a separate dialog per tag. Tags that already exist
 * are silently skipped, same as the single-tag version.
 */
export async function ensureTagsConfirmed(
  supabase: SupabaseClient,
  workspaceId: string,
  rawNames: string[],
  confirm: ConfirmFn,
  notifyError: NotifyErrorFn
): Promise<boolean> {
  const names = [...new Set(rawNames.map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) return true;

  const { data: existing } = await supabase.from("workspace_tags").select("name").eq("workspace_id", workspaceId).in("name", names);
  const existingNames = new Set((existing ?? []).map((r) => r.name as string));
  const missing = names.filter((n) => !existingNames.has(n));
  if (missing.length === 0) return true;

  const list = missing.map((n) => `"${n}"`).join(", ");
  const confirmed = await confirm({
    title: missing.length === 1 ? `Create tag ${list}?` : `Create ${missing.length} tags?`,
    body: missing.length === 1 ? `${list} isn't a tag yet in this workspace.` : `${list} aren't tags yet in this workspace.`,
    confirmLabel: missing.length === 1 ? "Create tag" : "Create tags",
  });
  if (!confirmed) return false;

  for (const name of missing) {
    const { error } = await supabase.rpc("create_workspace_tag", { p_workspace_id: workspaceId, p_name: name });
    if (error) {
      notifyError(error.message);
      return false;
    }
  }
  return true;
}
