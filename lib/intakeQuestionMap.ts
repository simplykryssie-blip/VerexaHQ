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
    answerKey: "taxpayer_detail.ip_pin",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Have an IRS Identity Protection PIN",
    businessReason: "Required on the e-file or it will reject; single authoritative location for taxpayer-level IP PIN (Section 5 shows it read-only).",
    flag: "identity_protection_pin",
    documentRequest: "ip_pin_letter",
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
    answerKey: "marriage.married_during_year / separated_not_divorced",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Married at any point during the tax year / Separated but not legally divorced",
    businessReason: "Determines whether marriage-date fields and the spouse section are needed even if filing status alone doesn't already imply it.",
    opensConditional: "marriage.date_married/date_separated/date_divorced, SpouseSection",
  },
  {
    answerKey: "marriage.date_married / date_separated / date_divorced",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Date married / separated / divorced",
    businessReason: "Needed to confirm filing-status eligibility as of December 31.",
  },
  {
    answerKey: "marriage.has_decree",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Have a divorce decree or separation agreement",
    businessReason: "Single authoritative source for the divorce document request (Section 5's duplicate 'Divorce' checkbox was removed).",
    documentRequest: "divorce_decree",
  },
  {
    answerKey: "marriage.spouse_lived_in_home / either_remarried / spouse_itemizes / community_property",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Spouse lived in the home / Either spouse remarried / Spouse itemizes / Community-property state",
    businessReason: "Each directly changes HOH/MFS eligibility or how community income is split; only asked when separated/MFS is already in play.",
  },
  {
    answerKey: "spouse.*",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Spouse identity, contact, and filing-relevant details",
    businessReason: "Required for a joint or MFS return; no SSN collected here by design (see spouse_id document request instead).",
    flag: "spouse_deceased / spouse_separate_preparer / identity_protection_pin",
    documentRequest: "spouse_id",
  },
  {
    answerKey: "dependents[].first_name/last_name/relationship/dob/months_lived",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Dependent identity and relationship",
    businessReason: "Minimum facts needed to test dependency eligibility; relationship is a normalized dropdown, not free text.",
    flag: "dependent_eligibility_review",
    documentRequest: "dependent_ssn_documents",
  },
  {
    answerKey: "dependents[].others_may_claim",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Someone else may also be able to claim them",
    businessReason: "Gates the custody follow-up questions -- asked before, not after, the custody-arrangement dropdown, so those questions never appear unless they're relevant.",
    opensConditional: "dependents[].lived_more_nights_with_taxpayer, other_parent_provided_8332, taxpayer_will_release_claim",
  },
  {
    answerKey: "dependents[].custody",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Custody arrangement",
    businessReason: "Data-collection only, worded to avoid implying an eligibility conclusion -- staff make the actual determination.",
  },
  {
    answerKey: "dependents[].student / disabled / income / childcare / education",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Student / disability / income / childcare / education flags",
    businessReason: "Each maps to a specific credit test (EIC, CTC, ODC, dependent care credit, education credits).",
  },
  {
    answerKey: "dependents[].form_8332 / ip_pin",
    section: 2,
    sectionTitle: "Household & Filing Basics",
    clientLabel: "Signed Form 8332 / IRS Identity Protection PIN",
    businessReason: "Both required on the e-file when applicable.",
    flag: "form_8332_needed / identity_protection_pin",
    documentRequest: "form_8332 / ip_pin_letter",
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
    clientLabel: "Prior-year filing status / prior preparer",
    businessReason: "Context for reviewing continuity between returns.",
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
    clientLabel: "Filed an extension",
    businessReason: "Changes the filing deadline staff plan around.",
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
    answerKey: "business_ownership.entity_type / ownership_pct / basis_info / capital_contributions / distributions / loans / sale_or_closure",
    section: 3,
    sectionTitle: "Income Sources",
    clientLabel: "Business ownership (K-1) detail",
    businessReason: "Basis and distribution facts materially affect K-1 preparation; k1_expected was removed since selecting 'k1' as an income source already implies it.",
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
    businessReason: "Screens for every common above-the-line adjustment, itemized deduction, and credit category not already captured elsewhere; property_taxes and real_estate_taxes were merged into a single key since they're the same fact worded twice.",
    flag: "marketplace_insurance",
    documentRequest: "form_1095a / mortgage_interest_statement / property_tax_statement / donation_receipts / tuition_form_1098t / childcare_statement / estimated_tax_payment_proof",
  },
  {
    answerKey: "deductions.other_credits_notes",
    section: 4,
    sectionTitle: "Adjustments, Deductions & Credits",
    clientLabel: "Other credits or deductions to tell us about",
    businessReason: "Catch-all for anything not covered by the checklist, reviewed manually by staff.",
  },

  // ---------------------------------------------------------------
  // Section 5 -- Life Changes & Special Situations
  // ---------------------------------------------------------------
  {
    answerKey: "life_changes.family.*",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Family changes (birth, adoption, death, dependent/custody changes, etc.)",
    businessReason: "Surfaces events not already captured by the Household section; marriage/divorce/separation were removed as duplicates of Section 2's marriage questions and replaced with a read-only summary.",
  },
  {
    answerKey: "life_changes.residence.*",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Residence changes (moved, worked remotely, lived abroad, disaster relocation)",
    businessReason: "Each can trigger part-year-resident or foreign-filing obligations not otherwise captured; the multiple_states checkbox was removed since the states list in Section 2 already drives that flag.",
  },
  {
    answerKey: "life_changes.employment.*",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Employment changes (new job, job loss, retirement, disability, stock comp, severance)",
    businessReason: "Each has a distinct tax-treatment implication; military_service and clergy were removed as duplicates of the same questions already in Section 3's W-2 detail.",
  },
  {
    answerKey: "life_changes.business.*",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Business changes (bought/sold a business, new partner, ownership change, payroll/contractor issues)",
    businessReason: "Ownership-transaction events not captured per-business in Section 3; started/closed a business were removed since the new per-business is_new/still_operating toggles in Section 3 supersede them.",
  },
  {
    answerKey: "life_changes.property.*",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Property changes (bought/sold home, refinanced, foreclosure, canceled debt, inherited/gifted property, like-kind exchange)",
    businessReason: "Each triggers a specific document request tied to a real-property or debt-cancellation event.",
    flag: "cancellation_of_debt",
    documentRequest: "closing_disclosure / home_sale_documents / 1099c_forms",
  },
  {
    answerKey: "life_changes.tax_compliance.audit / installment_agreement / offer_in_compromise / levy_or_lien / prior_rejected_return / bankruptcy",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Tax compliance history",
    businessReason: "Each independently forces a Special Review complexity classification and staff involvement -- these are the highest-consequence checkboxes on the form.",
    flag: "tax_compliance_review",
    documentRequest: "bankruptcy_records",
  },
  {
    answerKey: "has_irs_state_notice",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "IRS or state notice",
    businessReason: "Single authoritative source, wired directly to the top-level column the complexity/consultation logic reads.",
    flag: "irs_state_notice",
    documentRequest: "irs_state_notice_copy",
  },
  {
    answerKey: "has_unfiled_years",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Unfiled prior-year returns",
    businessReason: "Same pattern as has_irs_state_notice -- single authoritative key, not a separate disconnected jsonb field.",
    flag: "unfiled_years",
  },
  {
    answerKey: "life_changes.foreign.foreign_bank_accounts / foreign_assets / foreign_trust / foreign_business_ownership / foreign_gifts / foreign_inheritance / crypto_held_abroad",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Foreign activity",
    businessReason: "Each is a genuinely distinct FBAR/FATCA compliance trigger; foreign_income was removed as a duplicate of Section 3's income_sources checkbox.",
    flag: "foreign_reporting_review",
  },
  {
    answerKey: "life_changes.other.large_gift / inheritance / trust_estate_distribution",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Gifts, inheritance, trust/estate distributions",
    businessReason: "Each may trigger gift-tax or basis-reporting obligations not covered elsewhere; legal_settlement, gambling_activity, marketplace_insurance_changes, disaster_loss, and casualty_loss were all removed as duplicates of questions already asked in Section 3 or Section 4.",
  },
  {
    answerKey: "life_changes.other_notes",
    section: 5,
    sectionTitle: "Life Changes & Special Situations",
    clientLabel: "Anything else we should know?",
    businessReason: "Catch-all for anything the structured checkboxes miss.",
  },

  // ---------------------------------------------------------------
  // Section 6 -- Service Preferences & Payment Options
  // ---------------------------------------------------------------
  {
    answerKey: "payment_preference",
    section: 6,
    sectionTitle: "Service Preferences & Payment Options",
    clientLabel: "How would you prefer to pay for our services?",
    businessReason: "Drives billing workflow; gates the payment-timing follow-up questions so they never appear before a preference is chosen.",
    flag: "consultation_recommended (when 'discuss' is selected)",
    opensConditional: "readiness.preferred_timing/deposit_ability/third_party_payer/spouse_co_payer",
  },
  {
    answerKey: "readiness.preferred_timing / deposit_ability / third_party_payer / spouse_co_payer",
    section: 6,
    sectionTitle: "Service Preferences & Payment Options",
    clientLabel: "Payment timing and logistics",
    businessReason: "Only meaningful once a payment preference exists; billing/ops planning detail.",
  },
  {
    answerKey: "readiness.expedited_interest",
    section: 6,
    sectionTitle: "Service Preferences & Payment Options",
    clientLabel: "Interested in expedited service",
    businessReason: "Capacity-planning signal for staff scheduling.",
  },
  {
    answerKey: "readiness.consultation_requested",
    section: 6,
    sectionTitle: "Service Preferences & Payment Options",
    clientLabel: "Would like a consultation before we proceed",
    businessReason: "Direct input to the consultation-recommended flag.",
    flag: "consultation_recommended",
  },
  {
    answerKey: "readiness.portal_help / assistance_types",
    section: 6,
    sectionTitle: "Service Preferences & Payment Options",
    clientLabel: "Will you need help using the online portal? / What kind of help would be useful?",
    businessReason: "Creates a staff-visible client-assistance flag only -- deliberately excluded from complexity/pricing/acceptance logic so it can never bias those outcomes.",
    flag: "client_assistance_requested",
  },
  {
    answerKey: "readiness.deadline_concerns",
    section: 6,
    sectionTitle: "Service Preferences & Payment Options",
    clientLabel: "Any deadline or travel concerns we should know about?",
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
    businessReason: "Every item here traces back to a flag/document rule listed above -- this section never re-asks a tax question, it only asks the client to fulfill what earlier answers already generated.",
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
