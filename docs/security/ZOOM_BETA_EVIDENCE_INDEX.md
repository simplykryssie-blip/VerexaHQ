# Verexa HQ CRM — Zoom Marketplace Security Evidence Index

Purpose: submission index for Zoom Marketplace security evidence.

Application: Verexa HQ CRM
Repository: simplykryssie-blip/VerexaHQ

## Target distribution type: Published (Unlisted)

Verexa's Zoom integration is for authenticated Verexa customers only, connected
from inside the Verexa application (Verexa login -> Connect Zoom -> Zoom OAuth
-> return to the authenticated Verexa account -> Zoom features available
inside Verexa). It is not intended to be discoverable by the general public
browsing the Zoom Marketplace.

Published (Unlisted), with the app's install entry point set to "From your
site" pointed at the Verexa login/app, matches this model: hidden from
Marketplace search, usable by external customers, and installable only
through an authenticated Verexa session. Zoom itself does not enforce
"Verexa customers only" at the Marketplace level for an Unlisted app -- that
boundary is enforced by Verexa's own application, by only ever starting the
OAuth connection from inside an authenticated Verexa session.

The prior Beta submission's "App Beta - Insufficient Evidence" status does
not need to be resolved to proceed -- Beta is a temporary, capped sharing
path (per Zoom's own "Sharing Private and Beta Apps" documentation), not a
prerequisite for Published (Unlisted).

## Question to ask Zoom before any further spend

Per Zoom's own documentation (Sharing Private and Beta Apps; Security
requirements for Zoom Marketplace apps; App Review Guidelines and
Principles), a third-party penetration test is described as preferred/
encouraged evidence, not a documented mandatory requirement -- SAST and/or
DAST evidence is explicitly listed as acceptable. Before purchasing a
third-party penetration test, ask Zoom's reviewer (or
marketplace.security@zoom.us) directly:

> "We are requesting Published Unlisted distribution for an OAuth
> integration used exclusively by authenticated customers of our SaaS
> platform. We have SAST, DAST, TLS, and security remediation evidence. Is
> a third-party penetration test a mandatory blocker for this Unlisted
> application, or is the existing evidence sufficient?"

Do not represent the existing DAST evidence as a penetration test when
asking this question or submitting this package -- see Evidence
qualification below.

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
