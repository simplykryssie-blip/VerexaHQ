// Internal, staff-only documentation of every question in the
// Business/Entity Tax Intake. Mirrors lib/intakeQuestionMap.ts's shape and
// intent (see that file's header) but for the business questionnaire.
// Never imported into any client-facing component.

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

export const BUSINESS_INTAKE_QUESTION_MAP: IntakeQuestionMapEntry[] = [
  // ---------------------------------------------------------------
  // Entity routing (public start page, before Section 1)
  // ---------------------------------------------------------------
  {
    answerKey: "entity_classification",
    section: 0,
    sectionTitle: "Entity Routing",
    clientLabel: "How is the business currently taxed for federal purposes?",
    businessReason:
      "Determines which questions and document checklist apply; sole proprietorships and non-electing single-member LLCs are routed to the Individual Tax Intake instead of this one so nothing is asked twice.",
    flag: "entity_classification_unclear (when 'unsure')",
    opensConditional: "elections.form_2553_filed / elections.form_8832_filed (S-corp and LLC-electing entities only)",
  },
  {
    answerKey: "legal_business_name",
    section: 0,
    sectionTitle: "Entity Routing",
    clientLabel: "Legal business name",
    businessReason: "Minimum identity info to open a business client record; captured at intake start.",
  },

  // ---------------------------------------------------------------
  // Section 1 -- Business Identity & Tax Classification
  // ---------------------------------------------------------------
  {
    answerKey: "entity.dba_name",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Doing-business-as (DBA) name",
    businessReason: "Used for client matching and correspondence when the business operates under a trade name.",
  },
  {
    answerKey: "entity.formation_state / entity.formation_year",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "State of formation / year formed",
    businessReason: "Needed for state-filing requirements and to confirm entity age against filing history answers.",
  },
  {
    answerKey: "business EIN (intake_identity_vault, person_type='business')",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Business EIN",
    businessReason:
      "Required to prepare the return. Stored encrypted in intake_identity_vault, never in the answers JSON; only the last four digits are ever displayed, to staff with permission only.",
    documentRequest: "ein_confirmation_letter",
  },
  {
    answerKey: "entity.tax_year_type",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Tax year type (calendar/fiscal)",
    businessReason: "A fiscal-year entity changes filing deadlines and adds complexity.",
    flag: "fiscal_year_entity",
  },
  {
    answerKey: "return_type_detail",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "What kind of return is this?",
    businessReason: "Initial/final/amended/short-period returns each require different handling and forms.",
    flag: "initial_return / final_return / amended_return / short_period_return",
  },
  {
    answerKey: "elections.form_2553_filed / elections.acceptance_letter_available",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Was Form 2553 (S-election) filed? Do you have the acceptance letter?",
    businessReason: "Confirms the S-election is valid and on file; only asked for entities already classified as S-corp taxed.",
    flag: "s_election_review",
    documentRequest: "form_2553 / s_election_acceptance_letter",
  },
  {
    answerKey: "elections.form_8832_filed / elections.acceptance_letter_available_8832",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Was Form 8832 (entity classification election) filed? Do you have the approval letter?",
    businessReason: "Confirms the LLC's corporate-tax election is on file; only asked for LLCs electing S-corp or C-corp treatment.",
    flag: "form_8832_review",
    documentRequest: "form_8832 / classification_approval_letter",
  },
  {
    answerKey: "filing_history.prior_return_filed / filing_history.prior_copy_available",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Did the business file a return last year? Do you have a copy?",
    businessReason: "Prior-year figures carry forward (depreciation, basis, carryovers).",
    flag: "missing_prior_return",
    documentRequest: "prior_year_business_return",
  },
  {
    answerKey: "filing_history.unfiled_years",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Are there any prior years that still need to be filed?",
    businessReason: "Unfiled years are a compliance priority requiring special handling before the current year can be completed.",
    flag: "unfiled_years",
  },
  {
    answerKey: "filing_history.irs_state_notice",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Has the business received any notice from the IRS or a state tax agency?",
    businessReason:
      "Notices often carry deadlines; this is the single source of truth for this fact -- not re-asked in the Compliance section.",
    flag: "irs_state_notice",
    documentRequest: "irs_state_notices",
  },
  {
    answerKey: "filing_history.extension_filed",
    section: 1,
    sectionTitle: "Business Identity & Tax Classification",
    clientLabel: "Was an extension filed for the tax year covered by this intake?",
    businessReason: "Confirms the correct due date for this return; deliberately year-neutral wording so it needs no annual maintenance.",
    documentRequest: "extension_confirmation",
  },

  // ---------------------------------------------------------------
  // Section 2 -- Owners, Shareholders & Partners
  // ---------------------------------------------------------------
  {
    answerKey: "owners[] (full_name, role, ownership_pct, ownership_unsure)",
    section: 2,
    sectionTitle: "Owners, Shareholders & Partners",
    clientLabel: "Owner name, role, and ownership percentage",
    businessReason: "Required for K-1/1120-S/1065 allocations; repeatable so any number of owners can be added.",
    flag: "ownership_percentage_review (when percentages don't sum to ~100%)",
    documentRequest: "ownership_ledger",
  },
  {
    answerKey: "owner tax ID (intake_identity_vault, person_type='owner', person_ref=owner.local_id)",
    section: 2,
    sectionTitle: "Owners, Shareholders & Partners",
    clientLabel: "Owner SSN/ITIN/EIN",
    businessReason: "Required for K-1 preparation. Stored encrypted, keyed to the owner's stable local_id so it survives reordering; masked-only display.",
  },
  {
    answerKey: "owners[].received_compensation / owners[].received_distributions",
    section: 2,
    sectionTitle: "Owners, Shareholders & Partners",
    clientLabel: "Did this owner receive compensation or distributions?",
    businessReason: "Drives owner-compensation review, including S-corp reasonable-compensation scrutiny.",
    flag: "owner_compensation_review",
  },
  {
    answerKey: "owners[].had_loans",
    section: 2,
    sectionTitle: "Owners, Shareholders & Partners",
    clientLabel: "Did this owner make or receive any loans to/from the business?",
    businessReason: "Related-party loans require disclosure and interest-rate scrutiny.",
    flag: "related_party_transactions",
  },
  {
    answerKey: "ownership_structure.basis_records",
    section: 2,
    sectionTitle: "Owners, Shareholders & Partners",
    clientLabel: "Do you have records showing each owner's investment and activity in the business?",
    businessReason: "Plain-language basis question -- clients are never asked to self-assess 'basis' directly.",
    flag: "basis_records_review",
    documentRequest: "basis_worksheets",
  },

  // ---------------------------------------------------------------
  // Section 3 -- Business Operations & Locations
  // ---------------------------------------------------------------
  {
    answerKey: "operations.business_description / operations.principal_address / operations.location_count",
    section: 3,
    sectionTitle: "Business Operations & Locations",
    clientLabel: "What the business does, its main address, and number of locations",
    businessReason: "Basic operational context required on the return and for the preparer's understanding of the business.",
  },
  {
    answerKey: "states_lived_worked (reused from the shared intake column)",
    section: 3,
    sectionTitle: "Business Operations & Locations",
    clientLabel: "States the business operates or has employees/customers in",
    businessReason:
      "Reuses the same states_lived_worked column the individual intake uses rather than adding a duplicate states_operated column; drives multistate filing requirements.",
    flag: "multistate_return_review / state_filing_review",
  },
  {
    answerKey: "operations.foreign_activity",
    section: 3,
    sectionTitle: "Business Operations & Locations",
    clientLabel: "Does the business have foreign operations, accounts, or ownership?",
    businessReason: "Foreign activity can trigger additional international-reporting forms.",
    flag: "foreign_reporting_review",
  },

  // ---------------------------------------------------------------
  // Section 4 -- Financial Records, Income & Expenses
  // ---------------------------------------------------------------
  {
    answerKey: "bookkeeping.status",
    section: 4,
    sectionTitle: "Financial Records, Income & Expenses",
    clientLabel: "How would you describe the business's bookkeeping for this year?",
    businessReason: "Incomplete bookkeeping drives a cleanup recommendation and consultation before the return can proceed.",
    flag: "bookkeeping_cleanup_recommended",
  },
  {
    answerKey:
      "financial_records.{pl_statement,balance_sheet,bank_statements,trial_balance,general_ledger,credit_card_statements,loan_statements,fixed_asset_schedule,inventory_records}",
    section: 4,
    sectionTitle: "Financial Records, Income & Expenses",
    clientLabel: "Which financial records do you have available?",
    businessReason: "Each answer gates exactly one matching document request -- nothing is requested that the client already said they don't have.",
    documentRequest: "pl_statement / balance_sheet / trial_balance / general_ledger / bank_statements / credit_card_statements / loan_statements / fixed_asset_schedule / inventory_report",
  },

  // ---------------------------------------------------------------
  // Section 5 -- Payroll, Contractors & Owner Compensation
  // ---------------------------------------------------------------
  {
    answerKey: "payroll.has_employees / payroll.employee_count / payroll.provider_name",
    section: 5,
    sectionTitle: "Payroll, Contractors & Owner Compensation",
    clientLabel: "Employee count and payroll provider",
    businessReason: "Determines whether payroll forms (941/940, W-2/W-3) apply and are requested.",
    documentRequest: "payroll_summary / form_941_940 / w2_w3",
  },
  {
    answerKey: "payroll.all_returns_filed / payroll.late_deposits / payroll.unpaid_payroll_tax",
    section: 5,
    sectionTitle: "Payroll, Contractors & Owner Compensation",
    clientLabel: "Payroll compliance questions (filed on time, deposits, unpaid tax)",
    businessReason: "Payroll tax problems are high-priority compliance issues distinct from ordinary return preparation.",
    flag: "payroll_compliance_review / late_payroll_filing / unpaid_payroll_tax",
  },
  {
    answerKey: "contractors.has_contractors / contractors.contractor_count / contractors.w9_collected",
    section: 5,
    sectionTitle: "Payroll, Contractors & Owner Compensation",
    clientLabel: "Contractor count and whether W-9s are on file",
    businessReason: "Determines 1099 filing requirements.",
    documentRequest: "form_1099_nec / w9_records",
  },
  {
    answerKey: "contractors.unreported_payments / contractors.worker_classification_concern",
    section: 5,
    sectionTitle: "Payroll, Contractors & Owner Compensation",
    clientLabel: "Any contractor payments that may be unreported, or workers who may be misclassified?",
    businessReason: "Worker misclassification is an IRS audit trigger requiring careful review.",
    flag: "contractor_reporting_review",
  },
  {
    answerKey: "(derived) s_corp_reasonable_compensation_review",
    section: 5,
    sectionTitle: "Payroll, Contractors & Owner Compensation",
    clientLabel: "(No question asked -- automatic)",
    businessReason:
      "Automatically flagged whenever entity_classification is s_corp or llc_s_corp, since reasonable-compensation analysis is a preparer judgment call, not something clients should be asked to interpret.",
    flag: "s_corp_reasonable_compensation_review",
  },

  // ---------------------------------------------------------------
  // Section 6 -- Assets, Vehicles, Inventory & Loans
  // ---------------------------------------------------------------
  {
    answerKey: "assets.purchased_real_property",
    section: 6,
    sectionTitle: "Assets, Vehicles, Inventory & Loans",
    clientLabel: "Did the business purchase real property or major equipment this year?",
    businessReason: "Drives fixed-asset and depreciation setup for new purchases.",
    documentRequest: "closing_statements",
  },
  {
    answerKey: "assets.disposed_assets",
    section: 6,
    sectionTitle: "Assets, Vehicles, Inventory & Loans",
    clientLabel: "Did the business sell or dispose of any assets this year?",
    businessReason:
      "Sole source of truth for asset disposals -- the 'asset_sale' staff-review flag reads this same answer rather than a second, duplicate question in the Compliance section.",
    flag: "asset_sale",
    documentRequest: "closing_statements",
  },
  {
    answerKey: "vehicles.owned_or_leased / vehicles.personal_used_for_business",
    section: 6,
    sectionTitle: "Assets, Vehicles, Inventory & Loans",
    clientLabel: "Business vehicles owned/leased, or personal vehicle used for business",
    businessReason: "Determines whether mileage/vehicle records are requested.",
    documentRequest: "vehicle_mileage_records",
  },
  {
    answerKey: "loans[] (lender_name, purpose)",
    section: 6,
    sectionTitle: "Assets, Vehicles, Inventory & Loans",
    clientLabel: "Business loans (lender and purpose)",
    businessReason: "Repeatable list of business loans; any entry triggers a loan-documents request.",
    documentRequest: "loan_documents",
  },
  {
    answerKey: "equity.negative_capital_accounts",
    section: 6,
    sectionTitle: "Assets, Vehicles, Inventory & Loans",
    clientLabel: "Do any owner capital accounts have a negative balance?",
    businessReason: "Negative capital accounts can trigger gain recognition and require preparer review.",
    flag: "negative_capital_review",
  },

  // ---------------------------------------------------------------
  // Section 7 -- Changes & Compliance
  // ---------------------------------------------------------------
  {
    answerKey: "business_status.was_sold / was_merged / was_converted / ownership_changed",
    section: 7,
    sectionTitle: "Changes & Compliance",
    clientLabel: "Was the business sold, merged, converted, or did ownership change this year?",
    businessReason: "Any of these events materially changes how the return is prepared and may require a final or short-period return.",
    flag: "business_sale / merger_or_conversion / ownership_change",
  },
  {
    answerKey: "changes_compliance.related_party.{with_owners,with_relatives,with_commonly_owned}",
    section: 7,
    sectionTitle: "Changes & Compliance",
    clientLabel: "Business dealings with an owner, an owner's relative, or a commonly-owned business",
    businessReason:
      "Broader related-party transactions distinct from the per-owner loan question in Section 2 -- captures purchases/sales/leases, not just loans.",
    flag: "related_party_transactions",
  },
  {
    answerKey: "changes_compliance.tax_compliance.audit",
    section: 7,
    sectionTitle: "Changes & Compliance",
    clientLabel: "Is the business currently under audit?",
    businessReason: "High-priority compliance issue requiring immediate staff attention.",
  },
  {
    answerKey: "changes_compliance.tax_compliance.lien_or_levy",
    section: 7,
    sectionTitle: "Changes & Compliance",
    clientLabel: "Does the business have a tax lien or levy against it?",
    businessReason: "High-priority compliance issue.",
  },
  {
    answerKey: "changes_compliance.tax_compliance.installment_agreement",
    section: 7,
    sectionTitle: "Changes & Compliance",
    clientLabel: "Is the business on an IRS/state payment plan?",
    businessReason: "Confirms an existing agreement so the current return doesn't conflict with it.",
    documentRequest: "payment_plan_documents",
  },

  // ---------------------------------------------------------------
  // Section 8 -- Documents, Review, Verification & Submission
  // ---------------------------------------------------------------
  {
    answerKey: "(document uploads)",
    section: 8,
    sectionTitle: "Documents, Review, Verification & Submission",
    clientLabel: "Upload requested documents",
    businessReason: "Reuses the same intake_document_requests/intake_documents tables and upload UI as the individual intake -- no duplicate upload infrastructure.",
  },
  {
    answerKey: "(verification + submission)",
    section: 8,
    sectionTitle: "Documents, Review, Verification & Submission",
    clientLabel: "Verify email/phone and submit",
    businessReason: "Reuses verify_intake_code and submit_intake unchanged -- these RPCs are generic across intake types.",
  },
];
