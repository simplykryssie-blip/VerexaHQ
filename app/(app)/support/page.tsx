import Link from "next/link";
import { LifeBuoy, BookOpen, Wrench, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export const dynamic = "force-dynamic";

type Entry = { id: string; title: string; body: string; image_url: string | null };

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
      {entries.map((e) => (
        <details key={e.id} className="group px-5 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span className="text-muted transition-transform group-open:rotate-90">&rsaquo;</span>
              {e.title}
            </span>
          </summary>
          <div className="mt-2 pl-5">
            <p className="text-sm text-slate">{e.body}</p>
            {e.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.image_url} alt={e.title} className="mt-3 max-w-full rounded-lg border border-border" />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function SupportPage() {
  const supabase = createClient();
  const [{ data: articles }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.from("support_articles").select("id, section, title, body, image_url").order("display_order"),
    supabase.rpc("is_platform_admin"),
  ]);

  const howItWorks = (articles ?? []).filter((a) => a.section === "how_it_works");
  const troubleshooting = (articles ?? []).filter((a) => a.section === "troubleshooting");

  return (
    <>
      <PageHero
        icon={LifeBuoy}
        tone="accent"
        heading={
          <>
            <HeroHighlight>Support</HeroHighlight> center.
          </>
        }
        subtitle="How each part of Verexa works, and what to check first when something doesn't look right."
        actions={
          isPlatformAdmin ? (
            <Link
              href="/support/manage"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
            >
              <Settings2 size={14} aria-hidden="true" /> Manage content
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 space-y-8 px-8 py-6">
        <div>
          <SettingsSectionHeader icon={BookOpen} title="How Verexa works" description="A plain-language explanation of each major area." />
          <div className="mt-3">
            <EntryList entries={howItWorks} />
          </div>
        </div>

        <div>
          <SettingsSectionHeader icon={Wrench} title="Troubleshooting" description="Common issues and what to check first." />
          <div className="mt-3">
            <EntryList entries={troubleshooting} />
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
