// Substitutes {{token}} placeholders in message template bodies/subjects,
// e.g. "{{owner_name}}", "{{invitation_url}}", "{{expires_at}}" as used by
// the real early_access_message_templates content. Unknown tokens are left
// as-is rather than silently dropped, so a missing merge var is visible
// instead of producing misleading blank text.
export function mergeTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
