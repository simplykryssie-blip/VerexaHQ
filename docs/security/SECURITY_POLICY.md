# Verexa HQ CRM — Security Policy

Effective: October 2026
Owner: Verexa HQ CRM
Contact: support@verexahq.com

## 1. Purpose

This policy establishes the security principles and minimum controls used to protect Verexa HQ CRM, its customer workspaces, and information processed on behalf of those workspaces.

This policy describes operational security controls; it does not represent an external certification.

## 2. Security principles

Verexa follows these principles:

- Least privilege and deny-by-default authorization.
- Workspace and tenant isolation.
- Server-side authorization for security-sensitive operations.
- Secure handling of credentials and secrets.
- Encryption in transit and at rest through the application's hosting and data providers.
- Auditable changes and security-sensitive operations.
- Automated testing and security regression testing.
- Controlled production changes through version-controlled migrations and code review.
- Prompt remediation of confirmed security vulnerabilities.

## 3. Application security

The application uses server-side authorization, workspace-scoped permissions, database Row Level Security, role-based access controls, and protected server-side operations.

Security-sensitive workflows are tested for cross-workspace access, IDOR and object-ownership failures, permission bypass, public endpoint validation, authentication and MFA controls, storage/document access, webhook and server-side URL handling, and automation execution and failure states.

## 4. Data protection

Verexa processes customer and taxpayer information on behalf of firms. The Privacy Policy describes categories of information, subprocessors, security safeguards, retention, and rights.

Customer data is logically isolated by workspace, with database-level controls used to enforce tenant boundaries.

## 5. Change management

Production application and database changes are version-controlled. Security-sensitive changes are reviewed before merge and, where applicable, separately verified after deployment or migration.

Database migrations are tracked in the migration ledger. Where production/repository drift is discovered, it is recorded and reconciled separately rather than silently overwritten.

## 6. Security monitoring and testing

Verexa uses automated application tests, TypeScript and lint validation, security-focused regression tests, source-level security review, passive DAST using OWASP ZAP on an explicitly constrained preview target, SAST evidence generation through Semgrep, dependency and infrastructure review, and production verification for selected security remediations.

## 7. Incident response

Suspected security incidents are handled under the Incident Management and Response Policy.

## 8. Policy review

This policy is reviewed when material changes occur to the application's architecture, security controls, or regulatory obligations.
