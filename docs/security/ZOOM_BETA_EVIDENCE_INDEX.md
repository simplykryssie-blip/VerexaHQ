# Verexa HQ CRM — Zoom Marketplace Beta Security Evidence Index

Purpose: submission index for Zoom Marketplace Beta security evidence.

Application: Verexa HQ CRM
Repository: simplykryssie-blip/VerexaHQ

## Zoom-required evidence

| Zoom requirement | Evidence |
|---|---|
| SSDLС evidence | Secure development/change-control record plus Verexa security audit and remediation reports |
| SAST scanner output | GitHub Actions artifact: sast-semgrep-evidence |
| DAST scanner output | GitHub Actions artifact: dast-exact-five-page-evidence from the ZAP baseline workflow |
| Privacy Policy | Production /privacy route; canonical policy source is lib/legal/legalContent.ts |
| Security Policy | docs/security/SECURITY_POLICY.md |
| Vulnerability Management Procedures | docs/security/VULNERABILITY_MANAGEMENT.md |
| Incident Management & Response Policy | docs/security/INCIDENT_RESPONSE.md |
| Infrastructure/Dependency Management Policy | docs/security/INFRASTRUCTURE_DEPENDENCY_MANAGEMENT.md |
| Executive security assessment | Verexa system/security audit reports and remediation verification record |

## Security testing record

Verexa has undergone repeated security review and remediation cycles covering tenant isolation, authorization boundaries, public organizer submission security, automation reliability, SSRF defenses, response headers, workflow execution, database/RLS behavior, and regression testing.

The supporting audit reports distinguish static/source evidence from live behavioral evidence and do not claim exploitation where none was demonstrated.

## DAST evidence

The repository contains a dedicated passive ZAP workflow named DAST Baseline (Zoom Evidence). It is intentionally restricted to five hard-coded, read-only, unauthenticated pages on a validated Vercel Preview deployment. It does not spider, crawl, submit forms, invoke API routes, or perform active scanning.

A completed GitHub Actions run produced an official ZAP report artifact. The repository also contains the subsequent security-header remediation that addressed three of the findings identified by that baseline.

## Privacy

The production application exposes a dedicated Privacy Policy route at /privacy, with canonical policy content shared with the application's legal acceptance system. The policy describes collection, use, third-party processors, security, retention, rights, and contact information.

## Evidence qualification

This package does not claim an external certification, SOC 2, ISO 27001 certification, or a third-party penetration test unless separately documented. The DAST workflow is a passive baseline scan and is not a penetration test.

## TLS

Verexa is served through HTTPS on Vercel-managed domains. TLS configuration is enforced at the hosting/edge layer; the application does not implement a custom TLS stack.
