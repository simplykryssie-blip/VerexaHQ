// Shared service_type -> human-readable label helper. `services.service_type`
// and `service_templates.service_type` are free-text codes (e.g.
// "individual_tax_preparation") meant to be looked up against
// client_setup_options (option_group = 'client_service_type') for their
// real display label ("Individual Tax Preparation"). Several screens were
// found live rendering the raw code (or a crude `.replaceAll("_", " ")`,
// which only fixes casing/spacing, not codes like "business_tax" that
// don't share the same wording as their real label "Business Tax
// Preparation") — this is the one place that logic lives now.
export function humanizeServiceType(code: string | null | undefined, labels: Map<string, string>): string {
  if (!code) return "—";
  const known = labels.get(code);
  if (known) return known;
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
