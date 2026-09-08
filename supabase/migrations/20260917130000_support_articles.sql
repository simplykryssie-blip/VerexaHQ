-- The Support page was a hardcoded set of arrays in app/(app)/support/page.tsx
-- -- fine for a first pass, but it meant every content change (the explicit
-- ask here: "needs more details... I also want to be able to add photos")
-- required a code change and a deploy. This moves it to a real table any
-- platform admin can edit (and attach an image to) from a new /support/manage
-- page, without touching how any tenant workspace reads it. Global, not
-- workspace-scoped -- this is documentation about Verexa itself, the same
-- for every firm on the platform.

create table public.support_articles (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('how_it_works', 'troubleshooting')),
  title text not null,
  body text not null,
  image_url text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_articles_section_idx on public.support_articles (section, display_order);

alter table public.support_articles enable row level security;

-- Readable by any signed-in user of any workspace -- the Support page
-- lives inside the authenticated app shell already, so there's no
-- meaningful anonymous audience to additionally restrict against.
create policy support_articles_select on public.support_articles
  for select using (auth.role() = 'authenticated');
create policy support_articles_insert on public.support_articles
  for insert with check (public.is_platform_admin());
create policy support_articles_update on public.support_articles
  for update using (public.is_platform_admin());
create policy support_articles_delete on public.support_articles
  for delete using (public.is_platform_admin());

insert into storage.buckets (id, name, public) values ('support-content', 'support-content', true)
on conflict (id) do nothing;

create policy support_content_storage_insert on storage.objects
  for insert with check (bucket_id = 'support-content' and public.is_platform_admin());
create policy support_content_storage_update on storage.objects
  for update using (bucket_id = 'support-content' and public.is_platform_admin());
create policy support_content_storage_delete on storage.objects
  for delete using (bucket_id = 'support-content' and public.is_platform_admin());

-- Seed with the previously-hardcoded content, verbatim, plus new entries
-- covering areas that didn't exist yet when the original list was written
-- (Calendar/booking customization, Tax Office, IRS Authorizations,
-- Learning Hub, Firms/ERO Management, Billing).
insert into public.support_articles (section, title, body, display_order) values
('how_it_works', 'Contacts & Clients', $body$A client is the person or business you do work for -- everything else (engagements, documents, invoices, messages) lives underneath them. A client that hasn't started real work yet is tagged "Lead"; submitting an intake form or being accepted by staff flips them to an active client automatically. Adding a Relationship (spouse, business partner, etc.) or Contact under a client is optional and lives in the Contacts tab on their profile.$body$, 0),
('how_it_works', 'Engagements', $body$An engagement is one specific piece of work for one client -- e.g. their 2025 tax return. It's created from a Service Package, which is why creating the service first matters: the engagement inherits that service's pipeline (stages), pricing/billing rules, and any templates attached to its stages. An engagement's Workflow tab shows its current stage and lets staff mark stages complete to move it forward.$body$, 1),
('how_it_works', 'Services', $body$A service is what you sell ("Individual Tax Return," "Bookkeeping"). Opening one has three tabs: Details (name, price, category), Stages (the ordered steps its engagements move through, each optionally with a form, document request, or signable document template attached), and Board (a live view of which of your clients are currently sitting in which stage -- nothing to configure there, it just reflects what's already happening). Attaching a template to a stage never sends anything automatically -- it just pre-selects the right template when staff use the manual "Send Form" / "Request Documents" / "Send for Signature" buttons on an engagement at that stage. To actually automate sending, use Workflows instead -- that's a separate, optional engine, not part of a service. A service can also be marked bookable, which is what makes it selectable on your public booking page (see Calendar & Booking below).$body$, 2),
('how_it_works', 'Workflows (automations)', $body$Workflows let you make things happen automatically instead of a staff member remembering to do them -- e.g. when a client creates a portal account, send a welcome email and load their intake form; when a form is submitted, create the engagement and start its pipeline. Every workflow has a trigger (what starts it) and one or more steps (what happens). Nothing runs until a workflow exists and is Active (not Paused) -- each workflow's page shows its recent runs and an execution log so you can confirm it actually fired.$body$, 3),
('how_it_works', 'Documents', $body$Two related but separate things live here: Document Requests (a checklist of files you're asking a client for, tracked as each item gets fulfilled) and Folders (an organizational structure that gets applied to a client automatically once their service starts). E-signatures (documents) are tracked separately in the Signatures panel. All three can be sent manually from an engagement's Quick Actions, or from a stage's pre-filled action button if a template is attached there. The workspace-wide Document Center (its own nav item) lets you browse every client's files two ways -- "By client" (the same tree a single client's Files tab shows) or "By category," which groups every document across every client by its category (e.g. every signed engagement letter, every W-2) so you're not opening one client at a time to find something.$body$, 4),
('how_it_works', 'Messages', $body$Message threads are tied to a client or engagement. A message can be marked "Internal note" -- visible only to staff, never to the client -- which is useful for handoffs between teammates on the same file. On the Messages page, an internal note shows the sender's name and photo so it's clear who left it, since more than one staff member can post in the same thread. The Messages page also has an internal Team tab (direct messages with your own coworkers) separate from the client-facing Network tab (messages with a connected ERO/PTIN firm) -- automation-sent emails and texts to a client show up in that client's own thread too, not just messages you typed by hand.$body$, 5),
('how_it_works', 'Calendar & Booking', $body$The Calendar shows engagement/task due dates and appointments together. Your public booking page (Settings > Services, or a specific service's own link) lets clients self-schedule against your availability. Availability comes from three layers, most specific wins: a booking link scoped to one staff member uses that person's own hours and timezone (Settings > Profile > Availability); otherwise, a service assigned to a specific office uses that Location's hours and timezone (Settings > Services > Locations); otherwise, the workspace's own default hours apply. Each service can also override the minimum notice, buffer between bookings, and how many days ahead someone can book, independent of whichever hours source applies. A service can optionally collect a form as part of booking, prefilled from the contact info the client already entered.$body$, 6),
('how_it_works', 'Client Portal', $body$This is what your clients see when they log in: their own documents, messages, invoices, forms, and e-signature requests -- scoped strictly to their own file. The portal's logo and colors follow your firm's branding (Firm Profile > Branding); if your firm is connected to an ERO, your portal shows the ERO's brand instead of your own.$body$, 7),
('how_it_works', 'Portal invite 30-day expiration', $body$If a client is invited to the portal but never activates and confirms the invite within 30 days, that invite is automatically deactivated -- a daily background job checks for invites still sitting unconfirmed past that window and revokes them. This is separate from the invite link itself, which already stops working after 7 days regardless. Once revoked, the client's page (or their entry under Contacts, for a business client's contact) shows "Portal: invite expired" with a Reissue invite button -- that button issues a brand-new invite and link, and starts the 30-day window over.$body$, 8),
('how_it_works', 'Billing & Invoicing', $body$Quotes turn into invoices automatically once a client accepts them. An invoice's balance can be paid by check, ACH, wire, or card, and hits zero the moment the last payment is recorded -- that's what "paid off" means anywhere you see it (KPI tiles, notifications). A check/ACH/wire payment can be marked with an expected deposit date; a reminder fires if funds still haven't been confirmed received once that date arrives.$body$, 9),
('how_it_works', 'Tax Office', $body$A firm-wide view across five tabs: Return Status (every engagement's tax details -- return type, refund/balance, due date), Reviewer Queue (stages currently waiting on a specific reviewer), IRS Notices, Extensions, and Tax Year Metrics (season totals: filed, not filed, extended, amended, open notices). An ERO or Service Bureau admin sees these rolled up across every connected PTIN firm, not just their own workspace; everyone else sees only their own.$body$, 10),
('how_it_works', 'IRS Authorizations', $body$Tracks a Form 8821 tax information authorization end to end: identity verification, signature, submission to the IRS, IRS processing, and finally authorized (or denied/revoked). Status only ever moves forward -- there's no way to manually skip steps or go backward once a status is set, which is what keeps this list trustworthy as a real compliance record.$body$, 11),
('how_it_works', 'Learning Hub', $body$Training courses your firm (or a connected ERO/Service Bureau) publishes, made of lessons and quizzes. A manager can assign a specific course to specific staff with an optional due date -- assignees see it under "Assigned to you" with a due-date badge, and Team Progress (under Manage Courses) shows who has and hasn't made progress on what they were actually assigned, not just a flat completion log. Courses can be searched and filtered by category from the main catalog.$body$, 12),
('how_it_works', 'Firms & ERO Management', $body$If your workspace is an ERO Office, Service Bureau, or Multi-Office Firm, the Firms page lists every PTIN/ERO connected to you -- their info, production, package, and payout ledger. ERO Dashboard gives you the same team-wide workload and pipeline view as the main Dashboard, but for your whole firm's staff rather than just what's assigned to you.$body$, 13),
('how_it_works', 'Connections (ERO / PTIN)', $body$If your firm works with other PTINs for e-filing, Settings > Users & Staff lets you invite them to connect to your ERO. Once connected, a PTIN can share a client's engagement with you for review before it goes to e-file, and you can choose whether to cover their subscription billing.$body$, 14),
('how_it_works', 'Roles & Permissions', $body$Every staff member has a role, and that role's permissions control which pages and actions they can access. You start with default roles (owner, admin, staff); create a custom role from Settings > Roles & Permissions if you need finer control (e.g. a preparer role with no billing access).$body$, 15);

insert into public.support_articles (section, title, body, display_order) values
('troubleshooting', 'A client says they never got their portal invite email', $body$Ask them to check spam/junk first. If it's genuinely missing, confirm the email address on file is correct (Contacts > that client > Overview), then resend the invite from the client's page. If invites are failing for everyone, check Settings > Integrations for the email provider's connection status.$body$, 0),
('troubleshooting', 'A workflow (automation) didn''t fire', $body$Open that workflow and check three things in order: (1) it's Active, not Paused, (2) the trigger's configuration actually matches what happened (e.g. the right service, the right status), and (3) the Execution Log at the bottom of the workflow's page -- a failed run shows a specific error message rather than nothing at all.$body$, 1),
('troubleshooting', 'I can''t invite staff / don''t see an Invite button', $body$Independent PTIN workspaces are solo accounts by design and can't add staff. If your firm needs multiple staff, it needs to be set up as an ERO Office, Service Bureau, or Multi-Office Firm workspace instead.$body$, 2),
('troubleshooting', 'An engagement isn''t moving forward in its pipeline', $body$Open the engagement's Workflow tab -- stages only advance when someone explicitly marks the current stage complete. Nothing moves a stage forward silently, so if a client submitted something and the stage still shows as open, that's expected until staff mark it done.$body$, 3),
('troubleshooting', 'A document request or form isn''t showing as received', $body$Check the Requests tab under Documents -- items are marked fulfilled individually as the client uploads them, not all at once. For a form, check the client's engagement for a "needs service review" flag, which appears when a form submission couldn't be automatically matched to a service.$body$, 4),
('troubleshooting', 'My 2FA code isn''t working', $body$The 6-digit code comes from an authenticator app (like Google Authenticator or Authy) that you set up by scanning a QR code in Settings > Security -- it's not sent by text or email. If the code keeps failing, check that your phone's clock is correct (authenticator codes are time-based), or remove and re-add 2FA from Settings > Security.$body$, 5),
('troubleshooting', 'A signup confirmation link went somewhere unexpected', $body$This is a platform-level configuration issue, not something fixable from within the app -- contact Verexa support with the exact link and what happened.$body$, 6),
('troubleshooting', 'A booking link is showing the wrong available times', $body$Check which hours source applies: a link scoped to one staff member uses that person's own timezone/hours (Settings > Profile > Availability), a service assigned to a Location uses that office's hours (Settings > Services > Locations), and otherwise the workspace default applies. Confirm the right timezone is set on whichever of those actually governs that link.$body$, 7),
('troubleshooting', 'A staff member says a course was assigned to them but they can''t see it', $body$Confirm the assignment on the course's Manage page (Learning Hub > Manage Courses > that course) -- it lists everyone it's assigned to. If they're missing, they need to be an active member of your workspace (or a directly connected office's workspace) before they can be assigned.$body$, 8),
('troubleshooting', 'An IRS authorization seems stuck and won''t advance', $body$Status only moves forward and only through valid next steps -- if a manual advance option isn't available, the authorization has already reached a terminal status (Authorized, Denied, or Revoked) or is waiting on a step (identity verification, signature) that hasn't completed yet.$body$, 9);
