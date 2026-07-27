// Internal, staff-only documentation of every question retained after the
// global form-simplification audit. Never imported into any client-facing
// component -- this exists purely so a future editor (human or AI) can see,
// for each answer key: which section owns it, why the firm asks it, and
// what downstream logic (flag / document request / conditional question)
// depends on it, without having to re-derive that from the SQL functions
// and every Section*.tsx file by hand.
//
// "opensConditional" lists other questions that only appear because of this
// answer -- the conditional-interview rule from the audit (don't ask X
// unless Y already implies it's relevant).

export interface IntakeQuestionMapEntry {
  answerKey: string;
  section: number;
  sectionTitle: string;
  clientLabel: string;
  businessReason: string;
  flag?: string;
  documentRequest?: string;
  opensConditional?: string;
}

export const INTAKE_QUESTION_MAP: IntakeQuestionMapEntry[] = [
  // ---------------------------------------------------------------
  // Section 1 -- Identity & Entry
  // ---------------------------------------------------------------
  {
    answerKey: "contact_first_name / contact_last_name / contact_email / contact_phone / tax_year",
    section: 1,
    sectionTitle: "Identity & Entry",
    clientLabel: "Name, email, phone, tax year",
    businessReason: "Minimum identity/contact info to open a client record and reach them; captured at intake start, before the organizer.",
  },
  {
    answerKey: "readiness.best_contact_method",
    section: 1,
    sectionTitle: "Identity & Entry",
    clientLabel: "Best contact method",
    businessReason: "Staff need to know how to reach the client without guessing; moved here from Payment Preference since it's identity/contact info, not a payment question.",
  },
  {
    answerKey: "readiness.best_contact_time",
    section: 1,
    sectionTitle: "Identity & Entry",
    clientLabel: "Best contact time",
    businessReason: "Same as best_contact_method -- scheduling convenience, not payment-related.",
  },

  // ---------------------------------------------------------------
  // Section 2 -- Household & Filing Basics
  // ---------------------------------------------------------------
  {
    answerKey: "taxpayer_detail.occupation",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Occupation",
    businessReason: "Required on the return; also informs business/EIC due-diligence questions preparers must ask.",
  },
  {
    answerKey: "taxpayer_detail.current_address",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Current address",
    businessReason: "Required on the return and for correspondence.",
  },
  {
    answerKey: "taxpayer_detail.prior_address",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Prior-year address (if moved)",
    businessReason: "Flags a possible mid-year state-residency change preparers need to check.",
  },
  {
    answerKey: "taxpayer_detail.name_changed",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Has your legal name changed since your last tax return?",
    businessReason: "Name mismatches against IRS/SSA records are a common e-file rejection cause.",
    opensConditional: "taxpayer_detail.prior_name",
  },
  {
    answerKey: "taxpayer_detail.prior_name",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Prior legal name",
    businessReason: "Only needed when a name change was reported; helps reconcile IRS records.",
  },
  {
    answerKey: "taxpayer_detail.mailing_address_different",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Do you have a mailing address different from your home address?",
    businessReason: "Most clients don't -- asking this first avoids making everyone fill out a second address field.",
    opensConditional: "taxpayer_detail.mailing_address",
  },
  {
    answerKey: "taxpayer_detail.mailing_address",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Mailing address",
    businessReason: "Only collected when different from the home address; needed for correspondence.",
  },
  {
    answerKey: "taxpayer_detail.full_year_resident",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Were you a full-year resident of your state this year?",
    businessReason: "Determines whether a part-year/nonresident state return is needed.",
    opensConditional: "taxpayer_detail.residency_dates",
  },
  {
    answerKey: "taxpayer_detail.residency_dates",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Residency dates (partial-year)",
    businessReason: "Only needed for part-year residents; required for state apportionment.",
  },
  {
    answerKey: "taxpayer_detail.county",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "County / parish",
    businessReason: "Only relevant in states with local/school-district tax; shown only when a selected state has that relevance.",
  },
  {
    answerKey: "taxpayer_detail.school_district_status / school_district",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "School district or local tax district, if applicable",
    businessReason: "Drives local-tax-district filing obligations in the handful of states that have them; hidden entirely otherwise.",
  },
  {
    answerKey: "taxpayer_detail.citizen_or_resident",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "U.S. citizen or resident",
    businessReason: "Determines filing eligibility and whether a nonresident (1040-NR) return applies.",
  },
  {
    answerKey: "taxpayer_detail.blind / taxpayer_detail.disabled",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Legally blind / Have a disability",
    businessReason: "Directly affects the standard deduction amount and some credit eligibility.",
  },
  {
    answerKey: "taxpayer_detail.dob",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Date of birth",
    businessReason: "Required on the e-file; also drives some age-based credit tests. Never defaults to today -- blank until intentionally entered, required at review.",
  },
  {
    answerKey: "intake_identity_vault (person_type=taxpayer|spouse|dependent, identity_type=ssn|itin|atin|ip_pin)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Social Security number / ITIN / IP PIN, entered through the secure identity subsection (SecureIdentityField)",
    businessReason: "Required for e-file. Deliberately NOT a plain answers-jsonb field -- it's encrypted (pgp_sym_encrypt with a Vault-managed key) in a dedicated table, token-scoped on write, never returned to the browser after saving (only masked_value/last_four), and only decryptable by staff with the secure-data-reveal permission, rate-limited and audit-logged with masked values only. See supabase/migrations/20260730100000_intake_secure_identity_vault.sql.",
    flag: "identity_protection_pin (from identity_type=ip_pin, status=provided, any person)",
  },
  {
    answerKey: "taxpayer_detail.identity_theft",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Have been a victim of tax-related identity theft",
    businessReason: "Affects e-file eligibility and may require additional IRS verification steps.",
    flag: "identity_theft_indicator",
  },
  {
    answerKey: "taxpayer_detail.deceased / date_of_death",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Passed away during the tax year",
    businessReason: "Changes filing status, signature requirements, and required IRS forms.",
  },
  {
    answerKey: "filing_status_expected",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Expected filing status",
    businessReason: "Single most consequential answer on the intake -- drives standard deduction, credit eligibility, and whether spouse questions appear.",
    flag: "head_of_household_review / married_filing_separately",
    opensConditional: "SpouseSection (when MFJ/MFS/QSS/married-during-year/separated)",
  },
  {
    answerKey: "marriage.name_change_who / taxpayer_name_change.* / spouse_name_change.*",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Did you or your spouse use a different legal name during the tax year or on a prior tax return? (MFJ only)",
    businessReason: "Name mismatches against IRS/SSA records are a common e-file rejection cause. Collects the actual previous/current name, reason, SSA-update status, and name on tax documents rather than just a yes/no -- for MFJ this fully replaces the generic taxpayer_detail.name_changed question, which is hidden for that status to avoid asking twice.",
  },
  {
    answerKey: "marriage.first_year_filing_jointly / date_married / lived_different_states (MFJ)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Is this your first year filing jointly with this spouse? / Date married / Did either spouse live in a different state?",
    businessReason: "MFJ has no divorce/separation concept, so no marital-status question is needed at all -- these are the only three facts specific to a joint return beyond the shared SpouseSection fields below.",
    opensConditional: "marriage.date_married (only when first_year_filing_jointly is Yes)",
  },
  {
    answerKey: "marriage.marital_situation (MFS)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "What was your marital situation on December 31 of the tax year?",
    businessReason: "Single authoritative MFS question replacing four overlapping booleans (legally married Dec 31 / legally separated Dec 31 / lived together any time / lived together final six months). Also the authoritative trigger for the divorce_decree document alongside decree_final_date.",
    documentRequest: "divorce_decree (when separated_decree or divorced_decree)",
    opensConditional: "living-apart follow-ups or decree-final-date follow-ups depending on the answer",
  },
  {
    answerKey: "marriage.spouse_lived_home_last_six_months / date_separated / written_separation_agreement / paid_more_than_half_home_costs / qualifying_child_lived_with_you (MFS, married_living_apart only)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Living-apart detail for MFS",
    businessReason: "Only relevant when the client selected 'married but living apart' -- these facts inform whether HOH may actually be the better status.",
  },
  {
    answerKey: "marriage.decree_final_date / remarried_before_dec31 (MFS, separated_decree/divorced_decree only)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Date decree became final / Did you remarry before December 31?",
    businessReason: "Confirms the decree date drives the correct tax year and whether remarriage changes the analysis.",
  },
  {
    answerKey: "marriage.spouse_itemizes / access_to_spouse_income / community_property / community_income (MFS)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "MFS-specific questions (spouse itemized / access to spouse income / community-property state / community income)",
    businessReason: "Each directly affects MFS preparation mechanics; 'is spouse using another preparer' is intentionally NOT repeated here since SpouseSection's separate_preparer already asks it for every status that shows a spouse.",
  },
  {
    answerKey: "marriage.hoh_married_dec31 / hoh_spouse_lived_outside_six_months / hoh_paid_more_than_half_costs / hoh_qualifying_person_lived_with_you / hoh_another_may_claim (HOH)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "If you were married at year-end, did your spouse live outside your home for the entire last six months of the tax year? -- plus the household-support and qualifying-person facts.",
    businessReason: "Collects exactly the facts needed to review HOH eligibility without telling the client they qualify from a single answer -- an explicit disclaimer accompanies this block saying staff will also review who paid costs and whether a qualifying person lived with them.",
  },
  {
    answerKey: "marriage.divorced_or_separated_by_dec31 / date_divorced / widowed_this_year / date_of_widowhood (Single)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Were you divorced or legally separated under a final decree by December 31? / Did you become widowed during the year?",
    businessReason: "Single filers can still have a same-year divorce or widowhood relevant to filing-status eligibility for next year and to document requests (divorce_decree).",
    documentRequest: "divorce_decree (when divorced_or_separated_by_dec31 is Yes)",
  },
  {
    answerKey: "marriage.qss_qualifying_child / qss_paid_more_than_half_costs (QSS)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Do you have a qualifying child who lived with you the entire year? / Did you pay more than half the cost of keeping up the home?",
    businessReason: "The two facts specific to Qualifying Surviving Spouse eligibility beyond spouse-death, which SpouseSection already covers.",
  },
  {
    answerKey: "spouse.* (identity/contact fields) + intake_identity_vault (spouse SSN/ITIN/IP PIN)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Spouse identity, contact, and filing-relevant details",
    businessReason: "Required for a joint or MFS return. spouse.lived_with_taxpayer is hidden for MFS specifically since marriage.marital_situation already answers that fact for that status.",
    flag: "spouse_deceased / spouse_separate_preparer / identity_protection_pin",
    documentRequest: "spouse_id",
  },
  {
    answerKey: "dependents[].first_name/middle_name/last_name/relationship/dob/months_lived + intake_identity_vault (dependent SSN/ITIN/ATIN, keyed by dependents[].local_id)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Dependent identity and relationship",
    businessReason: "Minimum facts needed to test dependency eligibility. local_id is a client-generated stable reference (not the array index) so a dependent's secure identity record survives reordering or another dependent being removed.",
    flag: "dependent_eligibility_review",
    documentRequest: "dependent_ssn_documents",
  },
  {
    answerKey: "dependents[].disabled / income / provided_more_than_half_own_support / education / born_or_died_during_year",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Permanently and totally disabled / had income / provided more than half own support / education expenses / born or died during the year",
    businessReason: "Each maps to a specific dependency/credit test (qualifying-relative support test, CTC/ODC, education credits).",
  },
  {
    answerKey: "dependents[].student (age-gated)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Was this person a full-time student for at least five months during the tax year?",
    businessReason: "Only shown when age at December 31 of the tax year (derived from dob) is 19-23 -- under 19 the question is moot for the standard qualifying-child test, 24+ it no longer matters without another specific rule, so it's simply not asked.",
  },
  {
    answerKey: "dependents[].childcare_needed / childcare_providers[] (name/address/phone/amount_paid) + intake_identity_vault (provider SSN/EIN, keyed by childcare_providers[].local_id)",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Did you pay someone to care for this dependent so you or your spouse could work or look for work? -- then repeatable provider detail.",
    businessReason: "Replaces a generic 'you had childcare expenses' checkbox with the actual provider facts staff need, typed directly rather than requiring a statement upload. The provider's own tax ID goes through the same secure vault as taxpayer/spouse/dependent IDs, just under person_type=childcare_provider.",
    documentRequest: "childcare_statement (optional backup only, not required or blocking)",
  },
  {
    answerKey: "dependents[].could_another_claim",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Could another parent or person potentially claim this dependent?",
    businessReason: "Gates the entire custody/claim subsection -- asked as a plain claim-conflict question, not framed around 'custody arrangement' terminology. Only Yes/Unsure opens the subsection below.",
    opensConditional: "dependents[].living_situation and the rest of the claim subsection",
  },
  {
    answerKey: "dependents[].living_situation / approx_nights_taxpayer / approx_nights_other / expected_claimant / has_court_order / form_8332_involved / taxpayer_signed_or_received_8332 / additional_explanation",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "What best describes where this dependent lived? -- plus only-when-relevant follow-ups.",
    businessReason: "Collects the residency/agreement facts staff need for the IRS tiebreaker analysis without asking the client to apply or agree to those rules themselves -- an informational-only notice accompanies this subsection.",
    flag: "form_8332_needed",
    documentRequest: "form_8332",
  },
  {
    answerKey: "household.absence status / absences[]",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Was anyone temporarily away from the home during the tax year?",
    businessReason: "Feeds the residency test for dependency/EIC without the form drawing the conclusion itself -- structured entries let staff see duration instead of a blunt '6+ months' checkbox.",
  },
  {
    answerKey: "prior_filing.prior_status / prior_preparer",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Prior-year filing status (dropdown) / prior preparer",
    businessReason: "Context for reviewing continuity between returns; prior_status is a constrained dropdown (not free text) so staff get a normalized value.",
  },
  {
    answerKey: "has_prior_year_return",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "I have a copy of my prior-year tax return",
    businessReason: "Single authoritative source for the prior-year-return document request.",
    documentRequest: "prior_year_return",
  },
  {
    answerKey: "prior_filing.extension_filed",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Was an extension filed for the {tax year} tax year covered by this intake? (Yes/No/Unsure, year interpolated dynamically)",
    businessReason: "Changes the filing deadline staff plan around; explicitly scoped to the current intake's tax year so it can't be confused with an unresolved prior year, which is instead collected under Tax Problems in Section 5.",
  },
  {
    answerKey: "states_lived_worked",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "States lived/worked in",
    businessReason: "Single authoritative source for the multistate-return flag -- no separate 'did you work in multiple states' question anywhere else.",
    flag: "multistate_return",
  },
  {
    answerKey: "return_variant",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "This is an amended or prior-year return",
    businessReason: "Single authoritative source for the amended-return flag (Section 2's old separate 'amended returns in progress' question was a duplicate and was removed).",
    flag: "amended_return",
  },

  // ---------------------------------------------------------------
  // Section 3 -- Income Sources
  // ---------------------------------------------------------------
  {
    answerKey: "income_sources[]",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Income sources checklist",
    businessReason: "Drives nearly every downstream document request in this section and the complexity/consultation scoring.",
    flag: "multiple_income_sources",
    opensConditional: "Every per-income-type detail card below",
  },
  {
    answerKey: "w2_detail.employer_count / unreimbursed_expenses / clergy / military / household_employee / foreign_employer",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "W-2 detail",
    businessReason: "Each answer maps to a distinct preparation step (Schedule H, foreign-employer withholding review, etc.). multi_state was removed -- multistate status is derived from the states list in Section 2, not asked twice.",
    flag: "household_employer / clergy_income",
  },
  {
    answerKey: "self_employment_detail.businesses[].name/ein/address/activity",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Business identity",
    businessReason: "Minimum facts to prepare a Schedule C or business return per business.",
  },
  {
    answerKey: "self_employment_detail.businesses[].is_new / start_date",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "This business is new this year / start date",
    businessReason: "Start date is only meaningful -- and only asked -- when the client says the business is new.",
  },
  {
    answerKey: "self_employment_detail.businesses[].still_operating / closure_date",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "This business is still operating / closure date",
    businessReason: "Closure date is only asked when the client says the business closed, per the conditional-interview rule; also supersedes Section 5's old 'closed a business' checkbox.",
  },
  {
    answerKey: "self_employment_detail.businesses[].mileage / home_office / prior_depreciation",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Track mileage / claim home office / prior depreciation",
    businessReason: "Each triggers a specific document request.",
    documentRequest: "mileage_log / home_office_documentation / depreciation_schedule",
  },
  {
    answerKey: "self_employment_detail.businesses[].inventory / employees / contractors / payment_processor_forms / estimated_payments",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Inventory / employees / contractors / 1099-K / estimated payments",
    businessReason: "Each changes which schedules and payroll/1099 filings the return needs.",
  },
  {
    answerKey: "bookkeeping_cleanup_needed",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Bookkeeping needs cleanup before this return can be prepared",
    businessReason: "Single card-level question replacing the old per-business 'bookkeeping status' free-text field and Section 5's duplicate checkbox.",
    flag: "bookkeeping_cleanup_needed",
  },
  {
    answerKey: "business_ownership.entity_type / ownership_pct / basis_records / capital_contributions / distributions / loans / sale_or_closure",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Business ownership (K-1) detail -- basis question reworded to 'Do you have records showing your investment and activity in this partnership, S corporation, trust, or estate?' with plain-language examples",
    businessReason: "Basis and distribution facts materially affect K-1 preparation; k1_expected was removed since selecting 'k1' as an income source already implies it. basis_records is now a Yes/Some records/No/Unsure choice instead of a technical yes/no about 'basis' -- staff determine whether a calculation is required, not the client.",
    flag: "business_ownership",
  },
  {
    answerKey: "rentals[].address / ownership_pct / rental_dates / personal_use_days / improvements / short_term / sale_or_conversion / prior_depreciation",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Rental property detail",
    businessReason: "Determines Schedule E treatment, personal-use limitation, and short-term-rental (Schedule C) classification; income/expense-record and property-manager toggles were removed as they don't change any document request.",
    flag: "rental_property",
    documentRequest: "rental_income_records / depreciation_schedule",
  },
  {
    answerKey: "investments_detail.brokerage_accounts / cost_basis / employee_stock / worthless_securities / wash_sales",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Investment detail",
    businessReason: "Each affects Schedule D/8949 preparation complexity; stock_sales removed as a duplicate of the income_sources checkbox.",
  },
  {
    answerKey: "crypto_detail.reports_available",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Exchange/wallet reports available",
    businessReason: "The only crypto sub-question that changes anything operationally -- the 8 activity-type checkboxes were removed because they all produced the same document request.",
    documentRequest: "crypto_transaction_records",
  },
  {
    answerKey: "retirement_detail.early_withdrawal / rollover / roth_conversion / rmd",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Retirement income detail",
    businessReason: "Each has distinct tax treatment (penalty, nontaxable rollover, conversion income, RMD compliance); pension/ira/401k/disability sub-types were removed since they all produce the same 1099-R document request regardless.",
  },
  {
    answerKey: "social_security_detail.taxpayer / spouse / dependent",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Who received Social Security benefits",
    businessReason: "Needed to request the right SSA-1099(s).",
    documentRequest: "ssa_1099",
  },
  {
    answerKey: "unemployment_detail.withholding",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Had tax withheld from unemployment benefits",
    businessReason: "Affects estimated-payment/withholding reconciliation; state was removed as low-value (readable off the 1099-G itself).",
  },
  {
    answerKey: "interest_dividends_detail.banks / brokerage / tax_exempt / nominee",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Interest & dividend sources",
    businessReason: "Tax-exempt and nominee interest need different schedule treatment; foreign_accounts removed as a duplicate of Life Changes' foreign_bank_accounts.",
  },
  {
    answerKey: "other_income.*",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Other income checklist (gambling, settlements, cancellation of debt, etc.)",
    businessReason: "Each item is the single authoritative source for a specific document request; Section 5's near-duplicates (gambling_activity, legal_settlement) were removed in favor of these.",
    flag: "cancellation_of_debt / legal_settlement_review",
    documentRequest: "1099c_forms / settlement_documents / gambling_records",
  },

  // ---------------------------------------------------------------
  // Section 4 -- Adjustments, Deductions & Credits
  // ---------------------------------------------------------------
  {
    answerKey: "deductions.*",
    section: 4,
    sectionTitle: "Adjustments, Deductions & Credits",
    clientLabel: "Adjustments/deductions/credits checklist",
    businessReason: "Screens for every common above-the-line adjustment, itemized deduction, and credit category not already captured elsewhere; property_taxes and real_estate_taxes were merged into a single key since they're the same fact worded twice. dependent_care was removed entirely -- Section 2's per-dependent childcare workflow (name/address/phone/amount paid) is now the sole authoritative source for that fact.",
    flag: "marketplace_insurance",
    documentRequest: "form_1095a / mortgage_interest_statement / property_tax_statement / donation_receipts / tuition_form_1098t / estimated_tax_payment_proof",
  },
  {
    answerKey: "deductions.other_credits_notes",
    section: 4,
    sectionTitle: "Adjustments, Deductions & Credits",
    clientLabel: "Other credits or deductions to tell us about",
    businessReason: "Catch-all for anything not covered by the checklist, reviewed manually by staff.",
  },

  // ---------------------------------------------------------------
  // Section 5 -- Major Changes and Special Tax Situations
  // (rebuilt to five groups; family/residence/employment/business event
  // checklists from the prior round were dropped entirely as low-value --
  // none of them drove a flag or document request)
  // ---------------------------------------------------------------
  {
    answerKey: "life_changes.property.sold_home / rental_conversion / foreclosure_or_short_sale / inherited_property / gifted_property / like_kind_exchange / other",
    section: 5,
    sectionTitle: "Major Changes and Special Tax Situations",
    clientLabel: "Did you sell, inherit, receive as a gift, lose, or change the use of any property? (Property and Assets)",
    businessReason: "Each triggers a specific document request tied to a real-property event. foreclosure and short_sale merged into one item (foreclosure_or_short_sale); bought_home/refinanced were removed entirely -- the closing_disclosure document rule they drove is now dead code and was removed, since Section 4's mortgage_interest already captures the ongoing-mortgage fact.",
    flag: "cancellation_of_debt (foreclosure_or_short_sale)",
    documentRequest: "home_sale_documents / 1099c_forms",
  },
  {
    answerKey: "has_irs_state_notice / has_unfiled_years (reused) + life_changes.tax_compliance.audit / installment_agreement / levy_or_lien / prior_rejected_return / identity_theft_new / other_compliance_issue",
    section: 5,
    sectionTitle: "Major Changes and Special Tax Situations",
    clientLabel: "Did you have a tax issue that was not already reported earlier? (Tax Problems)",
    businessReason: "IRS/state notice and unfiled-return checkboxes here are bound directly to the same top-level keys Section 2's read-only summary already set -- not a new duplicate answer. bankruptcy moved out of this group into Legal or Financial Events per the new grouping; identity_theft_new is deliberately distinct from Section 2's taxpayer_detail.identity_theft (an existing/prior indicator) since it's scoped to 'not already reported.'",
    flag: "tax_compliance_review / irs_state_notice / unfiled_years",
    documentRequest: "irs_state_notice_copy",
  },
  {
    answerKey: "has_foreign_income (reused) + life_changes.foreign.foreign_bank_accounts / foreign_assets / foreign_trust / foreign_business_ownership / foreign_gifts / foreign_inheritance / other",
    section: 5,
    sectionTitle: "Major Changes and Special Tax Situations",
    clientLabel: "Did you have income, accounts, property, gifts, or business activity outside the United States? (Foreign Activity)",
    businessReason: "Each is a genuinely distinct FBAR/FATCA compliance trigger. 'Foreign income' here is bound to the exact same has_foreign_income key Section 3's income-sources checkbox sets -- one answer, shown in two places for context, not two answer keys.",
    flag: "foreign_reporting_review / foreign_income_complexity",
    documentRequest: "foreign_income_documents",
  },
  {
    answerKey: "other_income.cancellation_of_debt / lawsuit_settlements / gambling (reused), deductions.casualty_loss (reused), life_changes.legal_financial.bankruptcy / foreclosure_not_reported / other",
    section: 5,
    sectionTitle: "Major Changes and Special Tax Situations",
    clientLabel: "Did you experience any of these legal or financial events? (Legal or Financial Events)",
    businessReason: "Canceled debt, lawsuit settlement, gambling, and casualty loss are all bound to the same authoritative keys already set in Section 3/4 -- shown here for completeness, not asked twice. Bankruptcy moved here from Tax Problems per the new grouping; foreclosure_not_reported is a distinct catch for a foreclosure not already captured under Property and Assets.",
    flag: "tax_compliance_review (bankruptcy) / cancellation_of_debt / legal_settlement_review",
    documentRequest: "bankruptcy_records / 1099c_forms / settlement_documents / gambling_records",
  },
  {
    answerKey: "life_changes.estates_trusts.received / name / became_executor_or_beneficiary / filing_final_return",
    section: 5,
    sectionTitle: "Major Changes and Special Tax Situations",
    clientLabel: "Did you receive money or property from an estate or trust? (Estates and Trusts) -- plus executor/beneficiary and final-return questions.",
    businessReason: "Replaces the old generic 'death in family' checkbox, which had no direct tax purpose. Death only matters here in its specific tax-relevant forms: taxpayer/spouse/dependent death are each collected in their own identity section; this group covers the remaining facts (inheritance, executor role, final return) that the generic checkbox used to gesture at without actually capturing.",
    documentRequest: "estate_trust_documents",
  },
  {
    answerKey: "life_changes.other_notes",
    section: 5,
    sectionTitle: "Major Changes and Special Tax Situations",
    clientLabel: "Anything else we should know?",
    businessReason: "Catch-all for anything the five structured groups miss.",
  },

  // ---------------------------------------------------------------
  // Section 6 -- Service Preferences and Payment Options
  // ---------------------------------------------------------------
  {
    answerKey: "readiness.preferred_next_step",
    section: 6,
    sectionTitle: "Service Preferences and Payment Options",
    clientLabel: "Preferred next step (send a quote / consultation first / unsure)",
    businessReason: "Replaces the old implicit 'discuss with staff' payment-preference value as the primary quote-vs-consultation routing signal; selecting consultation_first also sets readiness.consultation_requested so the existing consultation_recommended flag logic keeps working unchanged.",
    flag: "consultation_recommended (when consultation_first)",
  },
  {
    answerKey: "payment_preference",
    section: 6,
    sectionTitle: "Service Preferences and Payment Options",
    clientLabel: "Preferred payment option (pay directly / ask about refund payment / discuss / unsure)",
    businessReason: "Stored value stays 'upfront' for the 'pay directly' option (only the label changed) to satisfy the existing intakes.payment_preference check constraint without a schema migration. Gates the refund-payment disclaimer and its two follow-up questions; no binding payment-plan or bank-product commitment happens on this screen.",
    flag: "consultation_recommended (when 'discuss' is selected)",
    opensConditional: "readiness.another_person_responsible_for_fee / discuss_before_quote (only when 'refund' is selected)",
  },
  {
    answerKey: "readiness.another_person_responsible_for_fee / discuss_before_quote",
    section: 6,
    sectionTitle: "Service Preferences and Payment Options",
    clientLabel: "Is another person responsible for the preparation fee? / Would you like to discuss this option before receiving the quote?",
    businessReason: "The only two questions asked when refund-payment is selected, alongside the required disclaimer text -- preferred_timing, deposit_ability, and spouse_co_payer were removed entirely as premature/binding questions that belong after quote approval, not on this screen.",
  },
  {
    answerKey: "readiness.expedited_interest",
    section: 6,
    sectionTitle: "Service Preferences and Payment Options",
    clientLabel: "Interested in expedited service",
    businessReason: "Capacity-planning signal for staff scheduling.",
  },
  {
    answerKey: "readiness.portal_help / assistance_types",
    section: 6,
    sectionTitle: "Service Preferences and Payment Options",
    clientLabel: "Will you need help using the online portal? / What kind of help would be useful?",
    businessReason: "Creates a staff-visible client-assistance flag only -- deliberately excluded from complexity/pricing/acceptance logic so it can never bias those outcomes.",
    flag: "client_assistance_requested",
  },
  {
    answerKey: "readiness.deadline_concerns",
    section: 6,
    sectionTitle: "Service Preferences and Payment Options",
    clientLabel: "Any important deadline or travel date we should know about?",
    businessReason: "Scheduling/urgency context for staff.",
  },

  // ---------------------------------------------------------------
  // Section 7 -- Documents
  // ---------------------------------------------------------------
  {
    answerKey: "(document upload + per-item status/note, no new tax questions)",
    section: 7,
    sectionTitle: "Documents",
    clientLabel: "Document checklist, generated entirely from earlier answers",
    businessReason: "Every item here traces back to a flag/document rule listed above -- this section never re-asks a tax question, it only asks the client to fulfill what earlier answers already generated. The generic, unconditional 'Other Documents' item was removed -- every request must now trace to a real answer.",
  },

  // ---------------------------------------------------------------
  // Section 8 -- Review & Submit
  // ---------------------------------------------------------------
  {
    answerKey: "(read-only summary, corrections, identity verification, acknowledgments, submission)",
    section: 8,
    sectionTitle: "Review & Submit",
    clientLabel: "Review & submit",
    businessReason: "No new facts collected -- confirms accuracy of everything already answered and captures the client's legal acknowledgment before creating the reviewable intake record.",
  },
];
