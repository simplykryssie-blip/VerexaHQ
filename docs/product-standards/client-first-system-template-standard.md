# VerexaHQ Product Standard: Client-First System Template Experience

Status: permanent product standard
Scope: **VerexaHQ system templates only** (`tax_organizer_templates.is_platform_template = true`)

This standard does **not** apply to templates a firm creates for its own
workspace (`is_platform_template = false`). Firm-created templates must
never be automatically rewritten or forced to follow this standard — see
"Custom Firm Templates" below.

## Objective

VerexaHQ should be the easiest tax CRM for clients to understand. The
competitive advantage is not feature count — it's reducing confusion,
reducing support requests, and reducing the number of clicks required to
complete an organizer. Every VerexaHQ system template should feel like
talking to an experienced tax professional, not completing IRS paperwork.

## System template standard

Every system question must answer:

1. What are we asking?
2. Why are we asking?
3. How should I answer?

## Question writing rules

- Write at approximately an 8th-grade reading level.
- Avoid IRS jargon whenever possible.
- If technical language is necessary: explain it, and provide an example.
- Never assume the client understands tax terminology.

## Question format

Every question supports these fields (`tax_organizer_questions`):

| Field | Column | Required? |
| --- | --- | --- |
| Question | `question_text` | required |
| Plain-language explanation | `explanation` | optional, but expected on any question needing context |
| Help text | `help_text` | optional, short supplementary hint |
| Example | `example_text` | optional |
| Placeholder | `placeholder` | optional |
| "Not Sure?" explanation | `not_sure_text` | optional, shown behind a toggle |
| Auto-formatting | `format_type` | optional (`ssn`, `ein`, `phone`, `zip`, `currency`, `percentage`) |

### Example

Instead of: *"Date business began operating"*

Use: **"When did your business actually start doing business?"**

- Explanation: *"This may be different from the day your LLC or
  corporation was legally created."*
- Example: *"If your LLC was formed January 1 but you opened your doors
  March 15, enter March 15."*

## Sensitive information

Whenever requesting SSN, EIN, bank account, routing number, birth date,
driver's license, or Business Tax ID: explain why it's needed and show a
formatted example.

Example:

> **Business Tax ID (EIN)**
> We use this number to prepare your federal and state tax returns.
> Example: `12-3456789`

## Formatting rules

Auto-format: SSN (`123-45-6789`), EIN (`12-3456789`), Phone
(`(337) 555-1234`), ZIP codes, dates, currency, percentages. Prevent
invalid characters where appropriate.

## Date fields

Every optional date field must support:

- Clear Date
- Blank value
- Edit value
- No default to today

Show **"Select a date"** instead of pre-filling today's date.

## Conditional logic

Never ask questions that don't apply — only ask spouse questions if
married, rental questions if rental property exists, payroll questions if
payroll exists, foreign account questions if applicable. Clients should
never feel like they're completing a government questionnaire.

## Progress

Every section should display: estimated completion time, a progress
percentage, and a simple explanation of the section.

## Encouraging language

Use encouraging language ("You're doing great." / "You're halfway
finished." / "Only one section left." / "Almost done."). Never make the
organizer feel intimidating.

## Error messages

Never display technical validation messages. Instead of "Invalid input,"
use "Please enter a valid EIN. Example: 12-3456789."

## Definitions

Whenever tax terminology is used, include an optional **"Not Sure?"**
button explaining it in plain language (e.g. Fiscal Year, Head of
Household, Estimated Payments, Capital Asset, Business Use of Home,
Dependent, 1099 Contractor).

## Client navigation

The client should almost never leave the organizer. Questions, uploads,
clarifications, progress, review, and submission happen inside one guided
workflow.

## Staff experience

The engagement remains the command center. Staff should rarely leave the
engagement page — organizer, documents, clarifications, messages, tasks,
notes, status, assignments, and workflow are all accessible from one
workspace.

## Custom firm templates

**Do not** enforce these writing standards on templates created by firms
(`is_platform_template = false`). Firm templates retain complete control
over question wording, help text, examples, brand voice, terminology,
labels, and layout.

However, every custom question editor should **offer** these fields as
optional tools — never rewrite the firm's wording automatically:

- Help Text
- Example
- Placeholder
- Why We Ask This
- Not Sure? explanation
- Auto Formatting
- Input Mask

## Applying this standard to new system templates

Any new VerexaHQ system template (`is_platform_template = true`) created
after this standard was adopted must be written to comply with it from
the start — question wording, explanations, examples, and format types
should be authored alongside the question, not retrofitted later.
