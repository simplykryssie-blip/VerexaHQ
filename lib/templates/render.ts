// Minimal {{merge.field}} substitution against a payload object -- the
// missing piece that actually reads email_templates/sms_templates'
// existing merge_fields-documented body_html/body instead of just storing
// tokens nobody renders.
export function renderTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((obj, key) => {
      if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, payload);
    return value === undefined || value === null ? "" : String(value);
  });
}
