// One row of Form 8821's "Tax Information" table (section 3) -- the real
// form supports several lines, each independently specifying what's being
// authorized. Stored as irs_authorizations.tax_matters (jsonb array).
export type IrsTaxMatterRow = {
  tax_info_type: string;
  tax_form_number: string;
  years_or_periods: string;
  specific_matters: string;
};

// One entry of irs_authorizations.designees (max 2, matching the real
// form). Snapshotted at creation, not live-joined to user_profiles -- same
// reasoning the old designee_name column used. PTIN is deliberately absent
// here: like SSN/ITIN/EIN it's encrypted at rest and revealed transiently at
// document-generation time only (reveal_designee_ptin), never persisted.
export type IrsDesignee = {
  user_id: string | null;
  name: string;
  caf_number: string | null;
  address: string;
  phone: string;
  fax: string;
  new_address: boolean;
  new_telephone: boolean;
  new_fax: boolean;
  receives_notices: boolean;
};
