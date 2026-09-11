// One row of Form 8821's "Tax Information" table (section 3) -- the real
// form supports several lines, each independently specifying what's being
// authorized. Stored as irs_authorizations.tax_matters (jsonb array).
export type IrsTaxMatterRow = {
  tax_info_type: string;
  tax_form_number: string;
  years_or_periods: string;
  specific_matters: string;
};
