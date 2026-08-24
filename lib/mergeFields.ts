// The realistic merge-field vocabulary for engagement letters, checked against
// live data before being written (see investigation notes in the commit this
// file was introduced in). Two kinds:
// - "auto" fields have a real, confirmed data source and would be
//   auto-populated once a real send pipeline exists (it doesn't yet -- this
//   builder is editor + sandbox preview only, same scope as the organizer
//   builder).
// - "manual" fields (payment_terms, deposit_percent, notice_type, notice_date)
//   have no matching column anywhere in the schema; the 6 real system
//   templates already use them as values a staff member types per send, not
//   data pulled from a record. Still real, still worth offering in the
//   picker -- just not auto-fillable.
export type MergeFieldKind = "auto" | "manual";

export type MergeFieldDef = {
  token: string;
  label: string;
  kind: MergeFieldKind;
  source?: string;
  /** Realistic placeholder used only in this builder's sandbox preview. */
  sample: string;
};

export const MERGE_FIELD_GROUPS: { group: string; fields: MergeFieldDef[] }[] = [
  {
    group: "Client",
    fields: [
      { token: "client_name", label: "Client full name", kind: "auto", source: "clients.first_name/last_name", sample: "Jordan Blake" },
      { token: "client_first_name", label: "Client first name", kind: "auto", source: "clients.first_name", sample: "Jordan" },
      { token: "business_name", label: "Business name", kind: "auto", source: "clients.business_name", sample: "Blake Consulting LLC" },
      {
        token: "client_address",
        label: "Client address",
        kind: "auto",
        source: "client_addresses (primary)",
        sample: "5520 Johnston Street, Lafayette, LA 70503",
      },
    ],
  },
  {
    group: "Engagement",
    fields: [
      { token: "engagement_number", label: "Engagement number", kind: "auto", source: "engagements.engagement_number", sample: "ENG-2026-000042" },
      {
        token: "tax_year",
        label: "Tax year",
        kind: "auto",
        source: "engagement_tax_details.tax_year (only present on tax-return engagements)",
        sample: "2025",
      },
      { token: "due_date", label: "Due date", kind: "auto", source: "engagements.due_date", sample: "April 15, 2026" },
      {
        token: "fee_amount",
        label: "Fee amount",
        kind: "auto",
        source: "quotes.total_amount (only present once a quote exists for the engagement)",
        sample: "$450.00",
      },
    ],
  },
  {
    group: "Firm",
    fields: [
      { token: "firm_name", label: "Firm name", kind: "auto", source: "workspaces.name", sample: "VerexaHQ Tax Advisors" },
      { token: "firm_address", label: "Firm address", kind: "auto", source: "workspaces.mailing_address", sample: "100 Main St, Suite 200, Lafayette, LA 70501" },
      { token: "firm_phone", label: "Firm phone", kind: "auto", source: "workspaces.phone", sample: "(337) 555-0100" },
    ],
  },
  {
    group: "Portal",
    fields: [
      // The client's sign-in link, not a one-time invite token -- for any
      // regular email/text that just needs to point someone back to their
      // portal (a reminder, a status update), as opposed to the dedicated
      // portal-invite-email flow, which has always sent its own tokenized
      // accept-invitation link automatically.
      { token: "portal_link", label: "Client portal link", kind: "auto", source: "app portal sign-in page", sample: "https://verexahq.com/portal/login" },
    ],
  },
  {
    group: "Filled in when sent (not auto-populated)",
    fields: [
      { token: "payment_terms", label: "Payment terms", kind: "manual", sample: "due upon receipt" },
      { token: "deposit_percent", label: "Deposit percent", kind: "manual", sample: "50%" },
      { token: "notice_type", label: "Notice type", kind: "manual", sample: "CP2000" },
      { token: "notice_date", label: "Notice date", kind: "manual", sample: "January 15, 2026" },
    ],
  },
];

export const ALL_MERGE_FIELDS: MergeFieldDef[] = MERGE_FIELD_GROUPS.flatMap((g) => g.fields);
export const SAMPLE_VALUE_BY_TOKEN: Record<string, string> = Object.fromEntries(ALL_MERGE_FIELDS.map((f) => [f.token, f.sample]));

/** Same {{token}} convention already used by email/sms templates. */
export function extractMergeFieldTokens(html: string): string[] {
  const matches = html.match(/\{\{\s*([\w.]+)\s*\}\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}\s]/g, ""))));
}

export function interpolateSample(html: string): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token) => SAMPLE_VALUE_BY_TOKEN[token] ?? `[${token}]`);
}
