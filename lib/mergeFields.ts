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
      {
        token: "portal_link",
        label: "Portal sign-in link (for returning clients)",
        kind: "auto",
        source: "app portal sign-in page",
        sample: "https://verexahq.com/portal/login",
      },
      // The one-time, tokenized accept-invitation link -- only resolves when
      // the client has a live, unexpired invitation; dispatch-notifications
      // refuses to send a message that uses this token if no such invitation
      // exists, rather than sending a broken/empty link.
      {
        token: "portal_invite_link",
        label: "Portal invite link (first-time account setup)",
        kind: "auto",
        source: "client_portal_users (requires an active, unexpired invitation)",
        sample: "https://verexahq.com/portal/accept-invitation?token=...",
      },
    ],
  },
  {
    group: "Preparer",
    fields: [
      {
        token: "preparer_caf_number",
        label: "Preparer's CAF number",
        kind: "auto",
        source: "user_profiles.caf_number (the staff member sending this document)",
        sample: "1234-56789R",
      },
    ],
  },
  {
    group: "IRS Form 8821",
    fields: [
      { token: "client_tin", label: "Taxpayer SSN/ITIN/EIN", kind: "auto", source: "clients.ssn_encrypted / itin_encrypted / ein_encrypted (revealed transiently, never stored)", sample: "123-45-6789" },
      { token: "client_phone", label: "Taxpayer daytime telephone", kind: "auto", source: "clients.primary_phone", sample: "(337) 555-0142" },
      { token: "plan_number", label: "Plan number (line 1d)", kind: "auto", source: "irs_authorizations.plan_number", sample: "001" },
      ...([1, 2] as const).flatMap((n) => [
        { token: `designee_${n}_name`, label: `Designee ${n} -- name`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "Jordan Blake, EA" },
        { token: `designee_${n}_address`, label: `Designee ${n} -- address`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "100 Main St, Lafayette, LA 70501" },
        { token: `designee_${n}_caf_number`, label: `Designee ${n} -- CAF number`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "1234-56789R" },
        { token: `designee_${n}_ptin`, label: `Designee ${n} -- PTIN`, kind: "auto" as const, source: "user_profiles.ptin_encrypted (revealed transiently, never stored)", sample: "P01234567" },
        { token: `designee_${n}_phone`, label: `Designee ${n} -- telephone`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "(337) 555-0100" },
        { token: `designee_${n}_fax`, label: `Designee ${n} -- fax`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "(337) 555-0101" },
        { token: `designee_${n}_new_address`, label: `Designee ${n} -- new address (checkbox)`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "true" },
        { token: `designee_${n}_new_telephone`, label: `Designee ${n} -- new telephone (checkbox)`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "true" },
        { token: `designee_${n}_new_fax`, label: `Designee ${n} -- new fax (checkbox)`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "true" },
        { token: `designee_${n}_receives_notices`, label: `Designee ${n} -- receives notices (checkbox)`, kind: "auto" as const, source: `authorization designee ${n}`, sample: "true" },
      ]),
      { token: "additional_designees_attached", label: "Additional designees attached (checkbox)", kind: "auto", source: "irs_authorizations.additional_designees_attached", sample: "true" },
      { token: "intermediate_service_provider", label: "Intermediate Service Provider (checkbox)", kind: "auto", source: "irs_authorizations.intermediate_service_provider", sample: "true" },
      { token: "specific_use_not_on_caf", label: "Specific use not recorded on CAF (checkbox)", kind: "auto", source: "irs_authorizations.specific_use_not_on_caf", sample: "true" },
      { token: "retain_prior_authorizations", label: "Retain prior authorizations (checkbox)", kind: "auto", source: "irs_authorizations.retain_prior_authorizations", sample: "true" },
      ...([1, 2, 3, 4, 5, 6] as const).flatMap((n) => [
        { token: `tax_matter_${n}_type`, label: `Tax matter ${n} -- type`, kind: "auto" as const, source: `authorization tax matter row ${n}`, sample: n === 1 ? "Income" : "" },
        { token: `tax_matter_${n}_form`, label: `Tax matter ${n} -- form number`, kind: "auto" as const, source: `authorization tax matter row ${n}`, sample: n === 1 ? "1040" : "" },
        { token: `tax_matter_${n}_years`, label: `Tax matter ${n} -- year(s)/period(s)`, kind: "auto" as const, source: `authorization tax matter row ${n}`, sample: n === 1 ? "2023, 2024" : "" },
        { token: `tax_matter_${n}_matters`, label: `Tax matter ${n} -- specific matters`, kind: "auto" as const, source: `authorization tax matter row ${n}`, sample: "" },
      ]),
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

/** Same sandbox preview, but tokens with a real, always-known value for the
 * current workspace (the firm's own name/address/phone -- never ambiguous,
 * unlike client/engagement fields which have no real value until one is
 * picked) resolve to that instead of a fake placeholder. Showing another
 * firm's sample name on your own template preview reads as broken, not as
 * an obvious placeholder the way "Jordan Blake" does. */
export function interpolatePreview(html: string, overrides: Record<string, string | null | undefined>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token) => overrides[token] || SAMPLE_VALUE_BY_TOKEN[token] || `[${token}]`);
}
