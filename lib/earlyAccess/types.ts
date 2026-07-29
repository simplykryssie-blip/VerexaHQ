// Types for the permanent VerexaHQ Early Access platform module.
// Every field verified against production (euxfopzgdmlmgcmmjvic) information_schema
// and CHECK constraints before use — do not add fields without re-verifying.

export type CampaignStatus =
  | "draft"
  | "accepting_applications"
  | "invite_only"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type CampaignProgramType = "alpha" | "beta" | "pilot" | "preview" | "early_access";

export type EarlyAccessCampaign = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  program_type: CampaignProgramType;
  status: CampaignStatus;
  version_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  application_open_at: string | null;
  application_close_at: string | null;
  max_workspaces: number | null;
  agreement_version: string | null;
  agreement_content: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

export type EarlyAccessApplication = {
  id: string;
  campaign_id: string;
  workspace_id: string | null;
  applicant_user_id: string | null;
  firm_name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  state_region: string | null;
  country: string | null;
  team_size: number | null;
  approximate_client_count: number | null;
  services: string[];
  current_crm: string | null;
  biggest_frustration: string | null;
  desired_feature: string | null;
  willing_to_attend_calls: boolean | null;
  status: ApplicationStatus;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export type InvitationStatus = "created" | "sent" | "opened" | "accepted" | "expired" | "revoked";

export type EarlyAccessInvitation = {
  id: string;
  campaign_id: string;
  application_id: string | null;
  workspace_id: string | null;
  email: string;
  token_hash: string;
  status: InvitationStatus;
  sent_at: string | null;
  opened_at: string | null;
  accepted_at: string | null;
  expires_at: string;
  accepted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EarlyAccessAgreement = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  user_id: string;
  invitation_id: string | null;
  agreement_version: string;
  agreement_snapshot: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  acceptance_metadata: Record<string, unknown>;
  created_at: string;
};

export type BugSeverity = "critical" | "high" | "medium" | "low";
export type BugStatus =
  | "new"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "fixed"
  | "released"
  | "closed"
  | "duplicate"
  | "cannot_reproduce";

export type EarlyAccessBugReport = {
  id: string;
  campaign_id: string | null;
  workspace_id: string;
  reported_by: string;
  title: string;
  description: string;
  expected_behavior: string | null;
  actual_behavior: string | null;
  module: string | null;
  page_url: string | null;
  browser_info: string | null;
  app_version: string | null;
  severity: BugSeverity;
  status: BugStatus;
  screenshot_path: string | null;
  diagnostic_metadata: Record<string, unknown>;
  assigned_to: string | null;
  resolution_notes: string | null;
  fixed_in_version: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type EarlyAccessBugComment = {
  id: string;
  bug_report_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
};

export type FeatureRequestStatus =
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed"
  | "declined"
  | "duplicate";

export type FeaturePriority = "critical" | "high" | "medium" | "low";

export type EarlyAccessFeatureRequest = {
  id: string;
  campaign_id: string | null;
  workspace_id: string;
  requested_by: string;
  title: string;
  description: string;
  business_value: string | null;
  frequency: string | null;
  category: string | null;
  status: FeatureRequestStatus;
  priority: FeaturePriority | null;
  planned_version: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EarlyAccessFeatureVote = {
  id: string;
  feature_request_id: string;
  workspace_id: string;
  user_id: string;
  created_at: string;
};

export type AnnouncementType = "general" | "release" | "maintenance" | "known_issue" | "urgent";
export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

export type EarlyAccessAnnouncement = {
  id: string;
  campaign_id: string | null;
  title: string;
  body: string;
  announcement_type: AnnouncementType;
  version_label: string | null;
  status: AnnouncementStatus;
  published_at: string | null;
  scheduled_for: string | null;
  expires_at: string | null;
  target_workspace_ids: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EarlyAccessAnnouncementRead = {
  id: string;
  announcement_id: string;
  workspace_id: string;
  user_id: string;
  read_at: string;
};

export type SurveyStatus = "draft" | "active" | "paused" | "closed";

export type SurveyQuestion = {
  key: string;
  label: string;
  type: "satisfaction" | "nps" | "text" | "choice";
  options?: string[];
  required?: boolean;
};

export type EarlyAccessSurvey = {
  id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  trigger_day: number | null;
  questions: SurveyQuestion[];
  status: SurveyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EarlyAccessSurveyResponse = {
  id: string;
  survey_id: string;
  campaign_id: string;
  workspace_id: string;
  user_id: string;
  answers: Record<string, string>;
  satisfaction_score: number | null;
  nps_score: number | null;
  submitted_at: string;
  created_at: string;
};

export type EarlyAccessActivityLog = {
  id: number;
  campaign_id: string | null;
  workspace_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type ApplicationQuestionType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "textarea"
  | "boolean"
  | "multiselect";

export type ApplicationQuestion = {
  key: string;
  type: ApplicationQuestionType;
  label: string;
  required: boolean;
  options?: string[];
};

export type SupportProcess = {
  instructions: string[];
  support_email: string;
  primary_channel: string;
  critical_definition: string;
  critical_response_target: string;
  standard_response_target: string;
};

export type EarlyAccessSettings = {
  id: string;
  campaign_id: string;
  allow_applications: boolean;
  require_agreement: boolean;
  allow_bug_reports: boolean;
  allow_feature_requests: boolean;
  allow_feature_voting: boolean;
  onboarding_steps: string[];
  support_email: string | null;
  feedback_email: string | null;
  application_questions: ApplicationQuestion[];
  support_process: SupportProcess | Record<string, never>;
  known_limitations: string[];
  created_at: string;
  updated_at: string;
};

export type MessageTemplateChannel = "email" | "sms" | "in_app";
export type MessageTemplateStatus = "draft" | "active" | "archived";

export type EarlyAccessMessageTemplate = {
  id: string;
  campaign_id: string;
  template_key: string;
  channel: MessageTemplateChannel;
  subject: string | null;
  body: string;
  status: MessageTemplateStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ResourceType = "guide" | "policy" | "faq" | "checklist" | "known_issues" | "support";
export type ResourceStatus = "draft" | "published" | "archived";

export type EarlyAccessResource = {
  id: string;
  campaign_id: string;
  resource_key: string;
  title: string;
  content: string;
  resource_type: ResourceType;
  status: ResourceStatus;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
