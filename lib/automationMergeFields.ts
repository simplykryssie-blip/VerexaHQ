import type { MergeFieldPickerGroup } from "@/components/settings/MergeFieldPicker";

// The exact v_context vocabulary execute_automation_step builds for every
// run (see the jsonb_build_object at the top of that function) -- narrower
// than lib/mergeFields.ts's engagement-letter catalog, because a run's
// context only ever has what's resolvable from its own engagement/client
// row, not the richer set (fee_amount, client_address, etc.) that comes
// from a real send flow with more context to pull from. Fields typed
// outside this list in a create_task/send_notification/etc. step render
// as an empty string, so this list is what's actually safe to offer.
export const AUTOMATION_MERGE_FIELD_GROUPS: MergeFieldPickerGroup[] = [
  {
    group: "Client",
    fields: [
      { token: "client_name", label: "Client full name" },
      { token: "first_name", label: "Client first name" },
    ],
  },
  {
    group: "Engagement",
    fields: [
      { token: "engagement_number", label: "Engagement number" },
      { token: "status", label: "Engagement status" },
      { token: "tax_year", label: "Tax year" },
    ],
  },
  {
    group: "Firm",
    fields: [
      { token: "firm_name", label: "Firm name" },
      { token: "office_phone", label: "Office phone" },
      { token: "office_email", label: "Office email" },
      { token: "portal_link", label: "Client portal link" },
    ],
  },
];
