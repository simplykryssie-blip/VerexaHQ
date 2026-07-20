export type Client = {
  id: string;
  workspace_id: string;
  client_type: "individual" | "business" | "family" | string;
  account_type:
    | "individual"
    | "household"
    | "business"
    | "estate"
    | "trust"
    | "nonprofit"
    | "other"
    | string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  status: string; // e.g. 'lead' | 'active' | 'inactive'
  source: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  date_of_birth: string | null;
  ssn_last_four: string | null;
  account_name: string | null;
};

export type Contact = {
  id: string;
  workspace_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  personal_email: string | null;
  personal_phone: string | null;
  occupation: string | null;
  portal_access: boolean;
  date_of_birth: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountContact = {
  id: string;
  workspace_id: string;
  account_id: string;
  contact_id: string;
  relationship_type: string | null;
  is_primary: boolean;
  portal_access: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientTag = {
  id: string;
  workspace_id: string;
  tag_name: string;
  tag_color: string | null;
  is_active: boolean;
};

export type ClientTeamMember = {
  id: string;
  workspace_id: string;
  client_id: string;
  user_id: string;
  created_at: string;
};

export type Pipeline = {
  id: string;
  workspace_id: string;
  pipeline_name: string;
  pipeline_type: string;
  description: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PipelineStage = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_name: string;
  stage_description: string;
  stage_color: string;
  sort_order: number;
  is_complete_stage: boolean;
  is_active: boolean;
};

export type Service = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_type: string;
  service_status: string;
  service_year: string;
  price: number | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  assigned_to: string | null;
  pipeline_id: string | null;
  pipeline_stage_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  task_title: string;
  task_description: string;
  task_status: "To Do" | "In Progress" | "Done" | string;
  priority: "Low" | "Normal" | "High" | string;
  due_date: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Deadline = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  deadline_title: string;
  deadline_type: string;
  due_date: string;
  deadline_status: "Upcoming" | "Due Soon" | "Past Due" | "Completed" | string;
  notes: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  member_status: string;
  display_name: string;
  job_title: string;
  avatar_url: string;
};

export type TaxReturn = {
  id: string;
  workspace_id: string;
  client_id: string;
  client_tax_year_id: string | null;
  tax_year: number;
  return_type: string;
  filing_status: string | null;
  return_status: string;
  extension_filed: boolean;
  extension_filed_date: string | null;
  extension_due_date: string | null;
  filed_date: string | null;
  efile_confirmation: string | null;
  federal_refund_amount: number | null;
  federal_balance_due: number | null;
  state_refund_amount: number | null;
  state_balance_due: number | null;
  prior_year_agi: number | null;
  prior_year_refund: number | null;
  carryover_loss: number | null;
  carryover_credits: number | null;
  delivered_to_client_at: string | null;
  client_approved_at: string | null;
  client_approval_method: string | null;
  preparer_id: string | null;
  reviewer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxEstimate = {
  id: string;
  workspace_id: string;
  client_id: string;
  tax_return_id: string | null;
  tax_year: number;
  quarter: string;
  due_date: string | null;
  estimated_amount: number | null;
  paid_amount: number | null;
  paid_date: string | null;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
};

export type TaxExtension = {
  id: string;
  workspace_id: string;
  client_id: string;
  tax_year: number;
  return_type: string;
  extension_status: string;
  original_due_date: string | null;
  extended_due_date: string | null;
  filed_at: string | null;
  confirmation_number: string | null;
  notes: string | null;
};

export type TaxOrganizerTemplate = {
  id: string;
  workspace_id: string | null;
  template_name: string;
  tax_year: number | null;
  return_type: string;
  is_platform_template: boolean;
  is_active: boolean;
};

export type TaxOrganizerSection = {
  id: string;
  template_id: string;
  section_title: string;
  section_description: string | null;
  sort_order: number;
};

export type TaxOrganizerQuestion = {
  id: string;
  section_id: string;
  question_text: string;
  help_text: string | null;
  question_type: "text" | "boolean" | "select" | "number" | "date" | string;
  options: string[];
  is_required: boolean;
  mapped_field: string | null;
  conditional_logic: Record<string, unknown> | null;
  sort_order: number;
};

export type TaxOrganizerAssignment = {
  id: string;
  workspace_id: string;
  client_id: string;
  client_tax_year_id: string | null;
  template_id: string;
  assignment_status: "draft" | "sent" | "submitted" | "reviewed" | "accepted" | string;
  sent_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  accepted_at: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
};

export type TaxOrganizerAnswer = {
  id: string;
  workspace_id: string;
  assignment_id: string;
  question_id: string;
  answer_value: unknown;
  answered_by: string | null;
  answered_at: string;
};

export type BookkeepingEngagement = {
  id: string;
  workspace_id: string;
  client_id: string;
  engagement_status: string;
  start_date: string | null;
  frequency: string | null;
  bookkeeping_software: string | null;
  last_reconciled_month: string | null;
  next_due_date: string | null;
  cleanup_needed: boolean;
  cleanup_start_month: string | null;
  cleanup_end_month: string | null;
  estimated_completion_date: string | null;
  monthly_fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BookkeepingFinancialAccount = {
  id: string;
  workspace_id: string;
  client_id: string;
  engagement_id: string;
  account_name: string;
  account_type: string | null;
  institution_name: string | null;
  masked_account_number: string | null;
  currency: string;
  opening_balance: number;
  opening_balance_date: string | null;
  is_active: boolean;
  notes: string | null;
};

export type BookkeepingPeriod = {
  id: string;
  workspace_id: string;
  client_id: string;
  engagement_id: string;
  period_start: string | null;
  period_end: string | null;
  period_status: string;
  period_month: number | null;
  period_year: number | null;
  bank_statements_received: boolean;
  credit_card_statements_received: boolean;
  reconciliation_done: boolean;
  reports_sent: boolean;
  client_approved: boolean;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
};

export type BookkeepingTransactionCategory = {
  id: string;
  workspace_id: string;
  category_name: string;
  category_type: string | null;
  parent_category_id: string | null;
  tax_line: string | null;
  is_active: boolean;
};

export type BookkeepingTransaction = {
  id: string;
  workspace_id: string;
  client_id: string;
  financial_account_id: string;
  bookkeeping_period_id: string | null;
  transaction_date: string;
  posted_date: string | null;
  description: string | null;
  payee: string | null;
  memo: string | null;
  reference_number: string | null;
  amount: number;
  transaction_type: string;
  category_id: string | null;
  status: string;
  created_at: string;
};

export type PortalAccessListItem = {
  portal_access_id: string;
  workspace_id: string;
  client_id: string;
  portal_email: string;
  access_status: string;
  workspace_name: string;
  client_name: string;
  last_login_at: string | null;
};

export type ClientPortalTodo = {
  id: string;
  workspace_id: string;
  client_id: string;
  related_table: string | null;
  related_id: string | null;
  todo_type: string | null;
  title: string;
  description: string | null;
  todo_status: "open" | "in_progress" | "completed" | "canceled" | "blocked" | string;
  due_date: string | null;
  completed_at: string | null;
  client_visible: boolean;
};

export type PortalConversation = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  subject: string;
  conversation_status: string;
  priority: string;
  last_message_at: string | null;
  last_message_by: string | null;
  created_at: string;
};

export type PortalMessage = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  client_id: string;
  sender_user_id: string | null;
  sender_type: "Client" | "Firm" | string;
  message_body: string;
  is_internal: boolean;
  created_at: string;
};

export type Document = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  document_name: string;
  document_category: string | null;
  document_status: string;
  requested_date: string | null;
  received_date: string | null;
  reviewed_date: string | null;
  notes: string | null;
  storage_bucket: string;
  storage_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_visible_to_client: boolean;
  document_year: number | null;
  rejection_reason: string | null;
  client_message: string | null;
  folder_id: string | null;
  created_at: string;
};

export type DocumentFolder = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  parent_folder_id: string | null;
  folder_name: string;
  folder_type: string;
  sort_order: number;
  is_visible_to_client: boolean;
};

export type DocumentFolderTemplate = {
  id: string;
  workspace_id: string | null;
  template_name: string;
  service_type: string | null;
  is_platform_template: boolean;
  is_active: boolean;
};

export type DocumentRequestTemplate = {
  id: string;
  workspace_id: string | null;
  template_name: string;
  service_type: string | null;
  is_platform_template: boolean;
  is_active: boolean;
};

export type PayrollClient = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  legal_name: string | null;
  fein: string | null;
  pay_frequency: string;
  payroll_status: string;
  next_pay_date: string | null;
  provider_name: string | null;
  provider_account_id: string | null;
  notes: string | null;
};

export type PayrollEmployee = {
  id: string;
  workspace_id: string;
  payroll_client_id: string;
  client_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  employment_status: string;
  worker_type: string;
  pay_type: string;
  hourly_rate: number | null;
  annual_salary: number | null;
  hire_date: string | null;
  termination_date: string | null;
  direct_deposit_status: string;
};

export type PayrollRun = {
  id: string;
  workspace_id: string;
  payroll_client_id: string;
  client_id: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  pay_date: string | null;
  run_status: string;
  gross_pay: number;
  employee_taxes: number;
  employer_taxes: number;
  deductions: number;
  net_pay: number;
  total_debit: number;
  employee_count: number;
  provider_run_id: string | null;
  submitted_at: string | null;
  processed_at: string | null;
  notes: string | null;
};

export type PayrollRunItem = {
  id: string;
  workspace_id: string;
  payroll_run_id: string;
  payroll_employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  other_hours: number;
  regular_pay: number;
  overtime_pay: number;
  other_pay: number;
  gross_pay: number;
  employee_taxes: number;
  deductions: number;
  net_pay: number;
};

export type PayrollFiling = {
  id: string;
  workspace_id: string;
  payroll_client_id: string;
  client_id: string;
  filing_type: string;
  jurisdiction: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  filing_status: string;
  confirmation_number: string | null;
  filed_at: string | null;
  notes: string | null;
};

export type PayrollTaxDeposit = {
  id: string;
  workspace_id: string;
  payroll_client_id: string;
  payroll_run_id: string | null;
  client_id: string;
  tax_type: string;
  jurisdiction: string;
  due_date: string | null;
  amount: number;
  deposit_status: string;
  payment_reference: string | null;
  paid_at: string | null;
};

export type Invoice = {
  id: string;
  workspace_id: string;
  client_id: string;
  invoice_number: string | null;
  invoice_status: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  currency: string;
  payment_collection_mode: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  external_payment_url: string | null;
  external_checkout_id: string | null;
  external_invoice_id: string | null;
  external_provider_status: string | null;
  payment_provider_connection_id: string | null;
};

export type InvoiceLineItem = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  service_type: string | null;
  item_name: string;
  item_description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

export type InvoicePayment = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  client_id: string;
  payment_amount: number;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
  notes: string | null;
  source_type: string;
  created_at: string;
};

export type RecurringInvoice = {
  id: string;
  workspace_id: string;
  client_id: string;
  service_id: string | null;
  service_type: string | null;
  amount: number;
  frequency: string;
  next_invoice_date: string | null;
  last_invoice_date: string | null;
  is_active: boolean;
  notes: string | null;
};

export type InvoicePaymentPlan = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  plan_status: string;
  installment_count: number;
  installment_amount: number;
  start_date: string | null;
  frequency: string;
};

export type PaymentPlanSchedule = {
  id: string;
  workspace_id: string;
  invoice_id: string;
  payment_plan_id: string;
  installment_number: number;
  amount: number;
  due_date: string | null;
  paid_date: string | null;
  status: string;
};

export type ReconciliationSession = {
  id: string;
  workspace_id: string;
  client_id: string;
  financial_account_id: string;
  bookkeeping_period_id: string;
  statement_start_date: string | null;
  statement_end_date: string | null;
  beginning_balance: number;
  ending_balance: number;
  cleared_deposits: number;
  cleared_withdrawals: number;
  calculated_ending_balance: number;
  difference: number;
  session_status: string;
  prepared_at: string | null;
  reviewed_at: string | null;
  notes: string | null;
};

export type ReconciliationItem = {
  id: string;
  workspace_id: string;
  reconciliation_session_id: string;
  transaction_id: string;
  cleared: boolean;
  cleared_amount: number | null;
  notes: string | null;
};

export type BookkeepingAdjustment = {
  id: string;
  workspace_id: string;
  client_id: string;
  financial_account_id: string;
  reconciliation_session_id: string | null;
  adjustment_date: string | null;
  adjustment_type: string | null;
  description: string | null;
  amount: number;
  created_at: string;
};

export type BookkeepingReportDelivery = {
  id: string;
  workspace_id: string;
  client_id: string;
  engagement_id: string;
  bookkeeping_period_id: string;
  report_type: string;
  report_title: string;
  document_id: string | null;
  report_status: string;
  prepared_at: string | null;
  reviewed_at: string | null;
  delivered_at: string | null;
  client_viewed_at: string | null;
  notes: string | null;
};

export type BookkeepingImportBatch = {
  id: string;
  workspace_id: string;
  client_id: string;
  financial_account_id: string;
  bookkeeping_period_id: string | null;
  source_type: string;
  original_file_name: string | null;
  import_status: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  created_at: string;
};

export type BookkeepingImportMapping = {
  id: string;
  workspace_id: string;
  mapping_name: string;
  file_type: string;
  column_mapping: Record<string, string>;
  date_format: string;
  amount_mode: "single_amount" | "debit_credit";
  debit_is_positive: boolean;
  header_row: number;
  is_default: boolean;
};
