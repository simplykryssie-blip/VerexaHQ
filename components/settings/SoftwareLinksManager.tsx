"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { EmptyState } from "@/components/EmptyState";

export type SoftwareLinkRow = { id: string; name: string; url: string };

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function SoftwareLinksManager({ workspaceId, initialLinks }: { workspaceId: string; initialLinks: SoftwareLinkRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [links, setLinks] = useState(initialLinks);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("workspace_software_links")
      .insert({ workspace_id: workspaceId, name: name.trim(), url: normalizeUrl(url), display_order: links.length })
      .select("id, name, url")
      .single();
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setLinks((prev) => [...prev, data]);
    setName("");
    setUrl("");
    router.refresh();
  }

  async function deleteLink(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("workspace_software_links").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    router.refresh();
  }

  return (
    <SettingsCard title="Software" description="List the software your firm uses -- these show up as a Software dropdown in the main nav for quick access.">
      {links.length === 0 ? (
        <EmptyState message="No software links yet." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-slate hover:text-accent">
                <ExternalLink size={14} className="shrink-0 text-muted" />
                <span className="font-medium">{link.name}</span>
                <span className="truncate text-xs text-muted">{link.url}</span>
              </a>
              <button
                type="button"
                onClick={() => deleteLink(link.id)}
                disabled={deletingId === link.id}
                className="shrink-0 rounded p-1 text-muted hover:text-danger disabled:opacity-60"
                aria-label={`Remove ${link.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addLink} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Software name"
          className="min-w-[10rem] flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="min-w-[10rem] flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={saving || !name.trim() || !url.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          <Plus size={14} /> Add
        </button>
      </form>
    </SettingsCard>
  );
}
