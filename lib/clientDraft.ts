// Persists an in-progress "new client" form across a same-tab navigation to
// view a matched duplicate, so choosing "View existing client" never
// silently discards what was typed. Keyed per entry point (NewClientButton,
// the New Engagement inline panel) so drafts from different flows can't
// collide or get restored into the wrong form.
const DRAFT_KEY_PREFIX = "verexa:new-client-draft:";

export function saveClientDraft(key: string, values: Record<string, unknown>) {
  try {
    sessionStorage.setItem(DRAFT_KEY_PREFIX + key, JSON.stringify(values));
  } catch {
    // sessionStorage unavailable (private browsing, etc.) -- draft recovery
    // just won't be available, not worth surfacing an error for.
  }
}

export function loadClientDraft<T = Record<string, unknown>>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearClientDraft(key: string) {
  try {
    sessionStorage.removeItem(DRAFT_KEY_PREFIX + key);
  } catch {
    // no-op
  }
}
