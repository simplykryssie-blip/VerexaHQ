# Verexa HQ CRM — Infrastructure & Dependency Management Policy

Effective: October 2026
Owner: Verexa HQ CRM
Contact: support@verexahq.com

## 1. Purpose

This policy defines controls for the infrastructure, hosting, dependencies, secrets, and deployment pipeline used by Verexa HQ CRM.

## 2. Infrastructure

Verexa uses managed hosting and infrastructure services including Vercel and Supabase. Third-party services used by the application are documented in the Privacy Policy and reviewed as part of security and operational assessments.

## 3. Environment separation

Development, preview, and production deployments are controlled through repository and hosting configuration. Database environment isolation is treated as a security boundary and must be verified before a deployed environment is permitted to perform state-changing security tests.

## 4. Secrets

Application secrets and provider credentials are stored through managed environment/secret mechanisms rather than committed to source control.

Secrets must not be included in source code, test fixtures, logs, or security evidence artifacts.

## 5. Dependency management

Dependencies are installed from the repository lockfile and reviewed as part of application maintenance and security assessment.

Material dependency vulnerabilities are evaluated through the vulnerability-management procedure and remediated according to risk.

## 6. Deployment control

Production changes are promoted from version-controlled source. Security-sensitive changes receive code review and automated validation before deployment.

Database changes use version-controlled migration files. Production migration application is separately verified where the change affects security or data integrity.

## 7. Monitoring

Application and infrastructure issues may be monitored through provider logs, application telemetry, and error monitoring. Security-relevant anomalies are handled through the incident-response process.

## 8. Backup and recovery

Managed infrastructure providers are responsible for underlying service availability and platform-level durability controls. Verexa's application recovery procedures are reviewed as part of operational readiness.

## 9. Provider changes

Material changes to hosting, database, authentication, payment, communications, or other security-relevant providers are assessed for security and privacy impact before adoption.

## 10. Review

This policy is reviewed when the application's infrastructure, dependency model, hosting providers, or security architecture materially changes.
