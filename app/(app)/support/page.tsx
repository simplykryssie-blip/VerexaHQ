import { LifeBuoy, BookOpen, Wrench } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export const dynamic = "force-static";

type Entry = { title: string; body: string };

const HOW_IT_WORKS: Entry[] = [
  {
    title: "Contacts & Clients",
    body: "A client is the person or business you do work for -- everything else (engagements, documents, invoices, messages) lives underneath them. A client that hasn't started real work yet is tagged \"Lead\"; submitting an intake form (organizer) or being accepted by staff flips them to an active client automatically. Adding a Relationship (spouse, business partner, etc.) or Contact under a client is optional and lives in the Contacts tab on their profile.",
  },
  {
    title: "Engagements",
    body: "An engagement is one specific piece of work for one client -- e.g. their 2025 tax return. It's created from a Service Package, which is why creating the service first matters: the engagement inherits that service's pipeline (stages), pricing/billing rules, and any templates attached to its stages. An engagement's Workflow tab shows its current stage and lets staff mark stages complete to move it forward.",
  },
  {
    title: "Services",
    body: "A service is what you sell (\"Individual Tax Return,\" \"Bookkeeping\"). Opening one has three tabs: Details (name, price, category), Stages (the ordered steps its engagements move through, each optionally with an organizer, document request, or engagement-letter template attached), and Board (a live view of which of your clients are currently sitting in which stage -- nothing to configure there, it just reflects what's already happening). Attaching a template to a stage never sends anything automatically -- it just pre-selects the right template when staff use the manual \"Send Organizer\" / \"Request Documents\" / \"Send for Signature\" buttons on an engagement at that stage. To actually automate sending, use Workflows instead -- that's a separate, optional engine, not part of a service.",
  },
  {
    title: "Workflows (automations)",
    body: "Workflows let you make things happen automatically instead of a staff member remembering to do them -- e.g. when a client creates a portal account, send a welcome email and load their intake form; when an organizer is submitted, create the engagement and start its pipeline. Every workflow has a trigger (what starts it) and one or more steps (what happens). Nothing runs until a workflow exists and is Active (not Paused) -- each workflow's page shows its recent runs and an execution log so you can confirm it actually fired.",
  },
  {
    title: "Documents",
    body: "Two related but separate things live here: Document Requests (a checklist of files you're asking a client for, tracked as each item gets fulfilled) and Folders (an organizational structure that gets applied to a client automatically once their service starts). E-signatures (engagement letters) are tracked separately in the Signatures panel. All three can be sent manually from an engagement's Quick Actions, or from a stage's pre-filled action button if a template is attached there.",
  },
  {
    title: "Messages",
    body: "Message threads are tied to a client or engagement. A message can be marked \"Internal note\" -- visible only to staff, never to the client -- which is useful for handoffs between teammates on the same file. On the Messages page, an internal note shows the sender's name and photo so it's clear who left it, since more than one staff member can post in the same thread.",
  },
  {
    title: "Client Portal",
    body: "This is what your clients see when they log in: their own documents, messages, invoices, organizers, and e-signature requests -- scoped strictly to their own file. The portal's logo and colors follow your firm's branding (Firm Profile > Branding); if your firm is connected to an ERO, your portal shows the ERO's brand instead of your own.",
  },
  {
    title: "Connections (ERO / PTIN)",
    body: "If your firm works with other PTINs for e-filing, Settings > Connections lets you invite them to connect to your ERO. Once connected, a PTIN can share a client's engagement with you for review before it goes to e-file, and you can choose whether to cover their subscription billing.",
  },
  {
    title: "Roles & Permissions",
    body: "Every staff member has a role, and that role's permissions control which pages and actions they can access. You start with default roles (owner, admin, staff); create a custom role from Settings > Roles & Permissions if you need finer control (e.g. a preparer role with no billing access).",
  },
];

const TROUBLESHOOTING: Entry[] = [
  {
    title: "A client says they never got their portal invite email",
    body: "Ask them to check spam/junk first. If it's genuinely missing, confirm the email address on file is correct (Contacts > that client > Overview), then resend the invite from the client's page. If invites are failing for everyone, check Settings > Integrations for the email provider's connection status.",
  },
  {
    title: "A workflow (automation) didn't fire",
    body: "Open that workflow and check three things in order: (1) it's Active, not Paused, (2) the trigger's configuration actually matches what happened (e.g. the right service, the right status), and (3) the Execution Log at the bottom of the workflow's page -- a failed run shows a specific error message rather than nothing at all.",
  },
  {
    title: "I can't invite staff / don't see an Invite button",
    body: "Independent PTIN workspaces are solo accounts by design and can't add staff. If your firm needs multiple staff, it needs to be set up as an ERO Office, Service Bureau, or Multi-Office Firm workspace instead.",
  },
  {
    title: "An engagement isn't moving forward in its pipeline",
    body: "Open the engagement's Workflow tab -- stages only advance when someone explicitly marks the current stage complete. Nothing moves a stage forward silently, so if a client submitted something and the stage still shows as open, that's expected until staff mark it done.",
  },
  {
    title: "A document request or organizer isn't showing as received",
    body: "Check the Requests tab under Documents -- items are marked fulfilled individually as the client uploads them, not all at once. For an organizer, check the client's engagement for a \"needs service review\" flag, which appears when an organizer submission couldn't be automatically matched to a service.",
  },
  {
    title: "My 2FA code isn't working",
    body: "The 6-digit code comes from an authenticator app (like Google Authenticator or Authy) that you set up by scanning a QR code in Settings > Security -- it's not sent by text or email. If the code keeps failing, check that your phone's clock is correct (authenticator codes are time-based), or remove and re-add 2FA from Settings > Security.",
  },
  {
    title: "A signup confirmation link went somewhere unexpected",
    body: "This is a platform-level configuration issue, not something fixable from within the app -- contact Verexa support with the exact link and what happened.",
  },
];

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {entries.map((e) => (
        <details key={e.title} className="group px-5 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span className="text-muted transition-transform group-open:rotate-90">&rsaquo;</span>
              {e.title}
            </span>
          </summary>
          <p className="mt-2 pl-5 text-sm text-slate">{e.body}</p>
        </details>
      ))}
    </div>
  );
}

export default function SupportPage() {
  return (
    <>
      <PageHeader
        title="Support"
        description="How each part of Verexa works, and what to check first when something doesn't look right."
      />
      <div className="flex-1 space-y-8 px-8 py-6">
        <div>
          <SettingsSectionHeader icon={BookOpen} title="How Verexa works" description="A plain-language explanation of each major area." />
          <div className="mt-3">
            <EntryList entries={HOW_IT_WORKS} />
          </div>
        </div>

        <div>
          <SettingsSectionHeader icon={Wrench} title="Troubleshooting" description="Common issues and what to check first." />
          <div className="mt-3">
            <EntryList entries={TROUBLESHOOTING} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          <LifeBuoy size={16} className="shrink-0" aria-hidden="true" />
          Still stuck? Reach out to whoever manages your Verexa workspace, or contact Verexa support directly.
        </div>
      </div>
    </>
  );
}
