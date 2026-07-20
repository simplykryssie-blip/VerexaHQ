# VerexaHQ Product Blueprint and PRD

**Version 1.0 — July 2026**

# 1. Product Direction and Non-Negotiable Boundaries

VerexaHQ is not a collection of disconnected CRM pages. It is a multi-tenant Practice Operating System that guides a professional-services firm from lead intake through service delivery, billing, client collaboration, completion, retention and renewal.

> **Core product question:** Every major screen must answer: Who is this? What work is being performed? What happens next?

## 1.1 What VerexaHQ is

- A centralized client and relationship system for individuals, businesses, households and related entities.
- A service-driven workflow system in which selected services create the correct workspace, recurring schedule, tasks, requests, folders, billing rules and staff assignments.
- A secure client collaboration portal for documents, requests, forms, signatures, messages, appointments and payments.
- A firm operations system for deadlines, capacity, compliance, revenue and accountability.
- A configurable SaaS product that can support multiple firms without mixing their records.

## 1.2 What VerexaHQ is not

- It is not a pixel-for-pixel or word-for-word copy of TaxDome or any competitor.
- It is not tax preparation software, a general ledger, a payroll processor or a bank-feed accounting engine in the first release.
- It is not a generic marketing CRM with accounting terminology added on top.
- It is not a group of static demo pages with buttons that do not complete real database actions.
- It is not acceptable for sample clients, template records or placeholder financial data to appear in production workspaces.

## 1.3 Competitive reference without copying

TaxDome demonstrates the value of centralizing CRM, documents, communication, billing and workflow. Its workflow model connects pipelines, stages, jobs and tasks, and its automations can create or send linked items when a job reaches a stage. VerexaHQ will preserve the business value of connected work while using its own terminology, information architecture, visual system and service-first operating model.

| Reference concept | Useful lesson | VerexaHQ differentiation |
| --- | --- | --- |
| Accounts and contacts | Separate a relationship container from the people connected to it. | Use Client Profiles with Personal, Business, Household and Entity relationship types; make primary contacts and communication routing explicit. |
| Pipelines, stages, jobs and tasks | Work needs a repeatable lifecycle and smaller actionable steps. | Use Service Workspaces, Workflows, Milestones and Action Items. Show a unified Next Action instead of forcing users to interpret boards. |
| Stage automations | Routine actions should trigger automatically. | Use event-based Automation Recipes with visible trigger, condition, action, delay, owner and audit history. |
| Organizers | Structured intake reduces back-and-forth. | Use Smart Forms and Service Questionnaires with conditional sections, reusable answers and completeness scoring. |
| Client portal | Clients need one secure place to act. | Use a simplified Action Center showing only what the client must do next, with personal and business communication preferences. |
| Linked documents/invoices/tasks | Work context should not be scattered. | Every Service Workspace contains its files, requests, messages, bills, approvals and history in one view. |

# 2. Product Principles

| Principle | Product requirement |
| --- | --- |
| One client truth | Information is entered once, linked everywhere and never silently duplicated. |
| Services configure the work | A service selection should launch the correct workflow instead of requiring manual setup. |
| Next action is always visible | Staff and clients should immediately know the next required action, owner and deadline. |
| Personal and business details remain separate | A client may use different emails, phones, addresses, billing contacts and portal recipients for personal and business matters. |
| Automation is transparent | Users can see why an automation ran, what it changed and how to undo or retry it. |
| Secure by default | Every record is tenant-isolated, permission-aware and auditable. |
| Progress is meaningful | Statuses represent real completion conditions, not cosmetic labels. |
| Templates accelerate setup | Firms start with industry-ready packs but can customize without code. |
| No dead ends | Every button must either complete an action, open a functioning workflow or clearly explain why it is unavailable. |
| Mobile-friendly client experience | Client actions must work well on phones even before a dedicated mobile app exists. |

# 3. Users, Roles and Permission Model

## 3.1 Internal user roles

| Role | Default responsibilities | Permission posture |
| --- | --- | --- |
| Firm Owner | Subscription, firm settings, security, full financial and operational control. | Full workspace access; protected from accidental removal. |
| Firm Administrator | Team setup, templates, workflows, client administration and reporting. | Broad access excluding ownership transfer and protected billing controls unless granted. |
| Manager / Reviewer | Work assignment, review, approvals, capacity and client oversight. | Access to assigned teams/clients plus approval actions. |
| Preparer / Bookkeeper / Payroll Specialist | Execute assigned service work and client follow-up. | Assigned clients and service workspaces only. |
| Billing Specialist | Invoices, payments, credits, collections and reporting. | Financial permissions without unrestricted document or SSN access. |
| Contractor / Seasonal Staff | Limited-time production work. | Least privilege, expiration date, assigned clients only, optional download restrictions. |
| Read-only Auditor | Review records and audit trails. | No write, export or download unless specifically granted. |

## 3.2 Client-side roles

| Client role | Examples | Capabilities |
| --- | --- | --- |
| Primary Portal Administrator | Owner, taxpayer, authorized representative. | Manage linked contacts, view all authorized services, receive firm-level notices. |
| Personal Contact | Individual taxpayer or spouse. | Personal tax forms, personal documents, personal billing/messages as authorized. |
| Business Contact | Owner, office manager, controller. | Business bookkeeping/payroll/tax documents and communications as authorized. |
| Employee / Limited Collaborator | Payroll employee, document uploader. | Only specifically assigned requests, forms or files. |
| Signer | Taxpayer, spouse, owner, officer. | Only documents and agreements requiring that person’s signature. |
| Billing Contact | AP contact or payer. | Invoices, payment methods and receipts only. |

## 3.3 Permission mechanics

- Permissions must combine role permissions, client assignment, service assignment and field-level sensitivity.
- Sensitive fields include SSN/TIN, date of birth, bank information, identity documents and payroll data.
- Viewing and editing sensitive fields must be separate permissions.
- Document download, export, bulk actions and impersonation must be independently controlled.
- All permission changes and sensitive-field access must be written to the audit log.
- Contractor access should support automatic expiration and immediate session revocation.

# 4. Information Architecture and Navigation

## 4.1 Primary navigation

| Navigation item | Purpose | Primary views |
| --- | --- | --- |
| Home | Prioritized work and risk. | My Day, Firm Overview, Alerts, Upcoming Deadlines. |
| Clients | People, businesses and relationships. | All Clients, Leads, Individuals, Businesses, Households, Archived. |
| Work | All active service delivery. | My Work, Team Work, Workflows, Recurring Work, Review Queue. |
| Documents | Firm-wide document operations. | Files, Requests, Signatures, Templates, Recent Activity. |
| Communication | Unified communications. | Secure Messages, Email, SMS, Announcements, Notifications. |
| Billing | Financial operations. | Invoices, Recurring Billing, Payments, Credits, Collections, Time. |
| Calendar | Appointments and operational deadlines. | Calendar, Booking, Due Dates, Payroll Dates, Tax Dates. |
| Reports | Operational and financial intelligence. | Revenue, Workflow, Capacity, Client Health, Compliance. |
| Templates | Reusable operating assets. | Services, Workflows, Tasks, Forms, Documents, Emails, Requests, Automations. |
| Settings | Firm and platform configuration. | Firm, Brand, Team, Security, Integrations, Portal, Subscription, Data. |

## 4.2 Universal command bar

The top bar should provide global search, quick create, notifications, help and user controls. Search must return clients, contacts, services, work items, documents, invoices and messages while respecting permissions.

## 4.3 Quick-create menu

- Client or lead
- Service workspace
- Task/action item
- Document request
- Invoice
- Appointment
- Secure message
- Internal note

# 5. Core Data Model: One Client Truth

## 5.1 Client Profile

The Client Profile is the durable relationship record. It may represent an individual, household, business, nonprofit, trust, estate or other entity. It is not the same thing as a portal login, contact person or service engagement.

### Required client information areas

| Area | Required behavior |
| --- | --- |
| Identity | Legal/display name, type, status, client number, source, lifecycle stage and assigned team. |
| Personal details | DOB, masked SSN/ITIN, filing status, occupation and personal addresses where authorized. |
| Business details | Legal name, DBA, EIN, entity type, formation state/date, fiscal year, industry and business addresses. |
| Contact methods | Multiple emails and phone numbers labeled Personal, Business, Billing, Payroll, Tax, Emergency or Custom. |
| Primary routing | Independently mark primary personal email/phone, primary business email/phone, billing contact and portal administrator. |
| Relationships | Spouse, dependent, owner, officer, partner, employee, related company, parent/subsidiary and authorized representative. |
| Services | Current, proposed, paused, completed and historical services with owners and dates. |
| Compliance | IDs, licenses, tax registrations, due dates and renewal tracking. |
| Preferences | Communication channels, language, contact times, delivery preference and consent. |
| Risk and restrictions | Do-not-contact, conflict notes, document restrictions, outstanding balance and offboarding status. |

> **Current Verexa correction:** Personal and business emails/phones must never automatically overwrite or mirror one another. The user chooses which contact route is primary for each service and communication type.

## 5.2 Contact records and portal users

A Contact is a person linked to one or more Client Profiles. A Portal User is an authenticated identity linked to a Contact. One person may access several related client profiles, and one client profile may have several contacts with different permissions.

## 5.3 Timeline

Every Client Profile must include a chronological activity timeline. Events include client creation, field changes, service changes, portal invitations, logins, messages, calls, emails, uploads, downloads, requests, signatures, payments, automation runs, task changes, notes and staff assignments.

# 6. Service Catalog and Service-Driven Setup

## 6.1 Service template structure

| Configuration | Examples |
| --- | --- |
| Service identity | Personal Tax Return, Business Tax Return, Monthly Bookkeeping, Payroll Administration, Sales Tax, Advisory, Business Formation. |
| Cadence | One-time, annual, quarterly, monthly, biweekly, weekly or custom. |
| Workflow template | Milestones, statuses, completion rules and review gates. |
| Action templates | Internal tasks, client to-dos, approvals and checklists. |
| Document requirements | Standard required documents plus conditional and custom items. |
| Smart forms | Intake questionnaires, annual update forms and service-specific organizers. |
| Folder structure | Client-visible and internal-only folders with naming rules. |
| Communication plan | Welcome message, reminders, status notices and completion message. |
| Billing plan | One-time, recurring, deposit, milestone or hourly billing. |
| Assignments | Account manager, preparer, bookkeeper, payroll specialist and reviewer roles. |
| Deadlines | Statutory date, internal target, client due date and extension rules. |
| Automation recipe | Trigger-condition-action sequences, delays and escalation rules. |

## 6.2 Adding a service to a client

1. User selects one or multiple services during client creation or from the Client Profile.
2. VerexaHQ displays the service defaults and lets the user confirm owner, cadence, start date, price, billing contact, communication route and portal participants.
3. On confirmation, the system creates a Service Workspace, work schedule, initial milestones, document checklist, folders, forms, billing setup and assignments.
4. The system shows a preview of everything that will be created before activation.
5. Activation is atomic: either all required records are created successfully or none are, with a clear error and retry option.

# 7. Service Workspace: The Center of Work

Each active service receives its own workspace inside the client profile. This avoids mixing bookkeeping, payroll and tax work while preserving a single client relationship view.

## 7.1 Workspace header

- Service name and period
- Current milestone/status
- Progress percentage based on completion rules
- Next action, owner and deadline
- Internal due date and statutory due date
- Assigned team
- Client-facing status
- Billing status
- Risk indicator

## 7.2 Workspace tabs

| Tab | Contents |
| --- | --- |
| Overview | Status, next actions, blockers, progress, key dates and recent activity. |
| Workflow | Milestones, action items, dependencies, approvals and history. |
| Requests | Requested documents/information, reminders, received items and exceptions. |
| Forms | Smart forms, completion score, unresolved questions and prior-year answers. |
| Documents | Workspace files, versions, approvals, signatures and delivery status. |
| Messages | Service-specific secure messages, emails and SMS. |
| Billing | Engagement terms, invoices, payments and service profitability. |
| Notes | Internal notes, call logs and pinned instructions. |
| Settings | Service configuration, team, recipients, deadlines and automation overrides. |

## 7.3 Status model

Internal work status and client-facing status must be separate. Internal statuses may be detailed; client statuses should be simple and reassuring.

| Internal status examples | Client-facing equivalent |
| --- | --- |
| Not started / Setup required | Getting started |
| Waiting for documents / Waiting for answers | Action needed |
| In preparation / Reconciliation in progress | In progress |
| Internal review / Manager review | Under review |
| Waiting for signature / payment | Action needed |
| Ready to deliver / Filed / Closed | Complete |

# 8. Workflow Engine

## 8.1 Workflow vocabulary

| Verexa term | Definition |
| --- | --- |
| Workflow Template | Reusable process for a service type. |
| Service Workspace | A client-specific instance of a service and period. |
| Milestone | A meaningful phase such as Intake, Preparation, Review or Delivery. |
| Action Item | A task assigned to staff, client or system. |
| Completion Rule | Condition required before a milestone can finish. |
| Dependency | A requirement that must be met before another action begins. |
| Review Gate | Approval required from a defined role. |
| Automation Recipe | A visible trigger-condition-action sequence. |
| Exception | A blocker, missing item, risk or deviation requiring attention. |

## 8.2 Workflow views

- Guided list view
- Board view
- Calendar view
- Review queue
- Recurring schedule

## 8.3 Completion rules

- All required staff actions completed.
- All required client requests resolved or explicitly waived.
- Required form submitted and accepted.
- Required invoice paid or payment exception approved.
- Required signature received.
- Reviewer approval recorded.
- Deliverable uploaded and marked final.
- External filing confirmation entered or attached.

## 8.4 Automation engine

| Trigger examples | Conditions | Action examples |
| --- | --- | --- |
| Service activated | Service type, client type, season, office | Create workspace, folders, requests, form, invoice and welcome message. |
| Milestone entered | Balance, missing items, assigned role | Create actions, notify client, assign reviewer, set due dates. |
| Request completed | All required items received | Complete intake milestone and begin preparation. |
| Invoice paid | Payment amount/status | Release documents, advance workflow, send receipt. |
| Signature completed | All required signers | Mark approval complete and advance. |
| Due date approaching | Days remaining, risk level | Notify owner, escalate manager, send client reminder. |
| No activity | Days inactive, current blocker | Create follow-up, notify owner, flag at-risk. |
| Recurring date | Cadence and service status | Create next period workspace and recurring invoice. |

> **Automation safety:** Every automation run must record its trigger, evaluated conditions, actions, outcome, timestamp and affected records. Users need Retry, Skip and Undo where technically safe.

# 9. Documents, Requests, Templates and E-Signatures

## 9.1 Document Center

- Firm-wide file search with permissions and filters.
- Client and service folder structures generated from templates.
- Internal-only, client-visible and client-upload folders.
- File version history, status, owner, category and related service.
- Bulk upload, drag-and-drop, preview, rename, move and categorize.
- Malware scanning, file-size/type validation and secure storage paths.

## 9.2 Document requests

Document requests must support both standardized selection and free-form needs.

| Requirement | Behavior |
| --- | --- |
| Standard catalog | W-2, 1099 series, bank statements, payroll reports, prior returns, IDs, formation documents and firm-custom items. |
| Multiple select | Add several requested items in one action. |
| Other/custom | Type a custom label and optionally save it to the firm catalog. |
| Upload matching | When uploading, choose the matching request/category or add a new label. |
| Status | Not requested, requested, viewed, uploaded, needs correction, accepted, waived. |
| Client instructions | Per-item description, examples and accepted file types. |
| Reminders | Configurable cadence, quiet hours, stop conditions and escalation. |
| Completion | Request set is complete only when required items are accepted or waived. |

## 9.3 Document templates and form fields

Users must be able to open every preloaded template in a preview/editor. Creating a new document template must lead directly to an editor where text, merge fields, signature fields, initials, dates, checkboxes, text inputs and conditional sections can be added.

## 9.4 E-signature requirements

- Multiple signers with assigned fields and signing order.
- Email and portal delivery with reminders.
- Immutable final signed copy and certificate/audit trail.
- Signer authentication options appropriate to document risk.
- Void, resend and replace workflows with reasons logged.
- Signed documents linked to the correct Client Profile and Service Workspace.

# 10. Smart Forms and Client Intake

## 10.1 Smart Form capabilities

- Drag-and-drop builder
- Conditional logic
- Pre-fill and controlled write-back
- Save and resume
- Question-level comments
- Annual rollover
- Completeness score
- Internal review status

## 10.2 New client intake flow

1. Create lead/client and select Individual, Business, Household or Other Entity.
2. Enter basic contact data with separate personal/business routes and identify primary contacts.
3. Select one or more services.
4. Assign owners and team roles.
5. Confirm portal recipients and permissions.
6. Preview generated workspaces, requests, forms, folders, billing and messages.
7. Activate client and automatically send portal invitation link.
8. Display invitation delivery status, expiration, resend and copy-link actions.

# 11. Client Portal and Action Center

## 11.1 Client home screen

| Section | Examples |
| --- | --- |
| Action required | Upload bank statement, answer questions, sign engagement letter, pay invoice. |
| In progress | Bookkeeping in review, tax return being prepared. |
| Upcoming | Payroll approval Friday, estimated tax due date. |
| Completed | Filed return, paid invoice, delivered financial statements. |
| Quick actions | Upload file, send secure message, book appointment, make payment. |

## 11.2 Portal permissions and routing

- Each portal user sees only authorized records.
- Invitations are automatically sent and status recorded.
- Personal and business notifications route correctly.
- Clients can manage notification preferences.
- Portal administrators may invite contacts only when allowed.

# 12. Communication Center

## 12.1 Channels

Secure messages, email, SMS, internal comments, announcements and call logs.

## 12.2 Unified communication timeline

All communication must appear within the related Client Profile and Service Workspace.

# 13. Billing, Engagements and Payments

## 13.1 Engagement and pricing models

- One-time fixed fee
- Recurring monthly/quarterly fee
- Deposit plus balance
- Milestone billing
- Hourly billing
- Per-form or per-employee pricing
- Custom payment plan

## 13.2 Billing objects

Proposal/Engagement, Invoice, Recurring Billing Plan, Payment, Credit/Adjustment, Time Entry and Collection Case.

## 13.3 Workflow linkage

Billing must be linkable to a Service Workspace. Exceptions require approval and audit reason.

# 14. Service-Specific Operating Packs

Personal tax return, business tax return, monthly bookkeeping, payroll administration, and business formation/compliance packs must be template-driven.

# 15. Dashboards and Reporting

## 15.1 Home: My Day

- Overdue and due-today actions
- Client blockers
- Review queue
- Unread communications
- Upcoming deadlines
- At-risk work
- Invoices requiring follow-up
- Recently assigned work

## 15.2 Firm owner dashboard

Revenue, WIP, risk, capacity, turnaround, response delays, recurring completion, client health and automation outcomes.

## 15.3 Report requirements

Filterable by date, office, service, staff, client segment and status. Exports must honor permissions and be logged.

# 16. Firm Settings and Brand Center

Use `workspace_brand_profiles` and `workspace-brand-assets` as the source of truth unless a migration is proven necessary.

# 17. Supabase Architecture

## 17.1 Architectural rules

- Every tenant-owned table must contain `workspace_id` and enforce RLS.
- Never trust browser-supplied workspace IDs.
- Use UUIDs and audit fields.
- Use soft deletion where required.
- Encrypt/tokenize highly sensitive identifiers.
- Storage paths begin with workspace/client scope.
- Service-role operations run server-side only.

## 17.2 Core schema groups

Tenant/identity, CRM, sensitive data, services, workflow, automation, documents, forms, communication, billing, calendar, firm settings, audit/operations.

## 17.3 Recommended key constraints

- Unique client number within workspace.
- One active primary contact method per purpose.
- Unique service workspace per period.
- Unique invoice number within workspace.
- Idempotency keys for invitations, payments, webhooks and automation.
- No cross-workspace foreign keys.
- Sequential document versions.
- One active published template version.

## 17.4 RLS policy pattern

Policies verify active membership and role/client/service restrictions. Sensitive access must use explicit permission checks and masked returns where possible.

## 17.5 Storage buckets

- `workspace-brand-assets`
- `client-documents`
- `document-templates`
- `signed-documents`
- `imports`

## 17.6 Database functions and edge functions

- `create_client_with_services`
- `activate_client_portal`
- `activate_service_workspace`
- `advance_milestone`
- `run_automation_recipe`
- `create_document_request_batch`
- `accept_uploaded_document`
- billing/payment server operations
- masked client summary
- audit event writes

# 18. Security, Privacy and Auditability

MFA, session revocation, encryption, masked reveals, append-only audit logs, malware scanning, signed URLs, webhook verification, rate limiting, backups and retention policies.

# 19. Integrations

P0: Supabase, transactional email, Stripe.  
P1: Google/Microsoft email and calendar, SMS, e-signature.  
P2: QBO/Xero, payroll providers, Zapier/webhooks/API.

# 20. Functional Acceptance Criteria

## 20.1 Client management

- Create individual/business clients without sample data.
- Separate personal/business contact methods.
- Primary routing.
- Masked sensitive data.
- Multiple services.
- Important client overview.

## 20.2 Portal

- Real invitations.
- Delivery lifecycle.
- Resend/copy link.
- Authorized Action Center.

## 20.3 Templates and documents

- All preloaded templates open.
- New templates open in an editor.
- Merge/form/signature fields.
- Multi-select and custom request labels.
- Upload matching.

## 20.4 Workflow

- Service activation creates complete workspace.
- Next action/owner/deadline visible.
- Completion rules enforced.
- Automation auditable.
- Recurring work avoids duplicates.

# 21. Implementation Roadmap

## Phase 0

Audit, remove fake data, fix broken routes, baseline migrations, audit RLS/storage.

## Phase 1

Tenant security, clients/contacts, service workspaces, workflow, documents, portal, billing foundation, Brand Center, audit log.

## Phase 2

Builders, automation, Smart Forms, e-signatures, integrations, reporting, service packs.

## Phase 3

Advanced billing, integrations, API, OCR/mobile, predictive indicators.

## Explicitly deferred

Native tax preparation/e-file, general ledger, payroll calculation, premature AI, marketplace/reseller program.

# 22. Claude GitHub/Vercel Execution Instructions

Read the PRD first. Audit existing repository/schema. Prefer consolidation. Preserve root structure, history and env files. Never expose secrets. Use atomic commits. Replace mocks with real Supabase calls. Test tenant isolation. Document environment variables.

## 22.2 Required repository audit output

- Current-state map
- Gap analysis
- Duplication report
- Security report
- Implementation plan
- Deployment report

## 22.3 Definition of done

Migration where needed, RLS tested, real data, complete UI states, audit events, responsive behavior, typecheck/build pass and acceptance criteria demonstrated.

# 23. Supabase Review Checklist

Review tenancy, membership, clients/contacts, sensitive data, services/workflow, documents, portal, automation, billing, branding, audit and operations.

# 24. Final Product Test Scenario

A beta is not ready until the complete firm setup → client creation → service activation → portal invite → document upload/form → workflow progression → review → invoice/payment → signature → final delivery → audit timeline scenario works with real data and tenant isolation.

# 25. Source Notes

Competitive research may use public documentation, but VerexaHQ terminology, architecture, information design and service-first workflow must remain original.
