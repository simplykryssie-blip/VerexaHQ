# Verexa HQ CRM — Zoom Marketplace Beta Security Evidence Index

Purpose: submission index for Zoom Marketplace Beta security evidence.

Application: Verexa HQ CRM
Repository: simplykryssie-blip/VerexaHQ

## Zoom-required evidence

| Zoom requirement | Evidence |
|---|---|
| SSDL evidence | Secure development/change-control record plus Verexa security audit and remediation reports |
| SAST scanner output | GitHub Actions artifact: sast-semgrep-evidence |
| DAST scanner output | GitHub Actions artifact: dast-exact-five-page-evidence from the ZAP baseline workflow |
| TLS 1.2+ | GitHub Actions artifact: tls-1-2-plus-evidence from the production TLS evidence workflow |
| Privacy Policy | Production /privacy route; canonical policy source is lib/legal/legalContent.ts |
| Security Policy | docs/security/SECURITY_POLICY.md |
| Vulnerability Management Procedures | docs/security/VULNERABILITY_MANAGEMENT.md |
| Incident Management & Response Policy | docs/security/INCIDENT_RESPONSE.md |
| Infrastructure/Dependency Management Policy | docs/security/INFRASTRUCTURE_DEPENDENCY_MANAGEMENT.md |
| Executive security assessment | docs/security/EXECUTIVE_SECURITY_ASSESSMENT.md plus Verexa system/security audit and remediation records |

## Security testing record

Verexa has undergone repeated security review and remediation cycles covering tenant isolation, authorization boundaries, public organizer submission security, automation reliability, SSRF defenses, response headers, workflow execution, database/RLS behavior, and regression testing.

The supporting audit reports distinguish static/source evidence from live behavioral evidence and do not claim exploitation where none was demonstrated.

## SAST evidence

The repository runs Semgrep through GitHub Actions and requires a non-empty SARIF report before the workflow can succeed. The resulting artifact is retained for 90 days.

## DAST evidence

The repository contains a dedicated passive ZAP workflow named DAST Baseline (Zoom Evidence). It is intentionally restricted to five hard-coded, read-only, unauthenticated pages on a validated Vercel Preview deployment. It does not spider, crawl, submit forms, invoke API routes, or perform active scanning.

A completed GitHub Actions run produced an official ZAP report artifact. The repository also contains the subsequent security-header remediation that addressed three of the findings identified by that baseline.

## Privacy

The production application exposes a dedicated Privacy Policy route at /privacy, with canonical policy content shared with the application's legal acceptance system. The policy describes collection, use, third-party processors, security, retention, rights, and contact information.

## TLS

Production Verexa traffic is served through Vercel-managed HTTPS. The repository contains a dedicated TLS evidence workflow that performs real TLS 1.2 and TLS 1.3 handshakes against verexahq.com and stores the output, certificate summary, and HTTPS response headers as a retained evidence artifact.

## Evidence qualification

This package does not claim an external certification, SOC 2, ISO 27001 certification, or a third-party penetration test unless separately documented. The DAST workflow is a passive baseline scan and is not a penetration test.

If Zoom specifically requires an independent third-party penetration test, that requirement remains external assurance and must be satisfied by an appropriately scoped independent provider; it cannot be represented by the internal audit, SAST, or passive DAST evidence.
