"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";

export type OptionRow = { id: string; label: string; display_order: number };
export type OptionGroupRow = { id: string; name: string; min_select: number; max_select: number | null; display_order: number; options: OptionRow[] };

const inputClass = "rounded-lg border border-border px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

function OptionGroupCard({ packageId, group }: { packageId: string; group: OptionGroupRow }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [minSelect, setMinSelect] = useState(group.min_select);
  const [maxSelect, setMaxSelect] = useState(group.max_select != null ? String(group.max_select) : "");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveSettings() {
    setSaving(true);
    const { error } = await supabase
      .from("firm_package_option_groups")
      .update({ name: name.trim() || group.name, min_select: minSelect, max_select: maxSelect.trim() ? Number(maxSelect) : null })
      .eq("id", group.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function deleteGroup() {
    if (!window.confirm(`Delete the "${group.name}" option group? This can't be undone.`)) return;
    const { error } = await supabase.from("firm_package_option_groups").delete().eq("id", group.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function addOption(e: React.FormEvent) {
    e.preventDefault();
    const label = newOptionLabel.trim();
    if (!label) return;
    const { error } = await supabase
      .from("firm_package_options")
      .insert({ option_group_id: group.id, label, display_order: group.options.length });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewOptionLabel("");
    router.refresh();
  }

  async function deleteOption(optionId: string) {
    const { error } = await supabase.from("firm_package_options").delete().eq("id", optionId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Group name
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveSettings} className={inputClass} placeholder="e.g. Tax software" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Min to choose
          <input
            type="number"
            min={0}
            value={minSelect}
            onChange={(e) => setMinSelect(Number(e.target.value))}
            onBlur={saveSettings}
            className={`${inputClass} w-20`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Max to choose
          <input
            type="number"
            min={0}
            value={maxSelect}
            onChange={(e) => setMaxSelect(e.target.value)}
            onBlur={saveSettings}
            placeholder="Unlimited"
            className={`${inputClass} w-24`}
          />
        </label>
        <button type="button" onClick={deleteGroup} disabled={saving} className="mb-1.5 rounded p-1.5 text-muted hover:text-danger" aria-label="Delete group">
          <Trash2 size={14} />
        </button>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {group.options.map((o) => (
          <li key={o.id} className="flex items-center justify-between py-1.5 text-sm text-slate">
            {o.label}
            <button type="button" onClick={() => deleteOption(o.id)} className="rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${o.label}`}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        {group.options.length === 0 && <li className="py-1.5 text-sm text-muted">No options yet.</li>}
      </ul>

      <form onSubmit={addOption} className="mt-2 flex items-center gap-2">
        <input
          value={newOptionLabel}
          onChange={(e) => setNewOptionLabel(e.target.value)}
          placeholder="e.g. TaxSlayer"
          className={`${inputClass} flex-1`}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!newOptionLabel.trim()}>
          <Plus size={13} aria-hidden="true" /> Add option
        </Button>
      </form>
    </div>
  );
}

export function PackageOptionGroupsEditor({ packageId, groups }: { packageId: string; groups: OptionGroupRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [newGroupName, setNewGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase
      .from("firm_package_option_groups")
      .insert({ package_id: packageId, name, min_select: 1, display_order: groups.length });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewGroupName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Give this package a menu of choices under its one price -- e.g. a group called &quot;Tax software&quot; where a connected
        firm picks 1 of 3, plus a &quot;Bank product&quot; group where they can pick up to 2. Leave max blank for unlimited.
      </p>
      {groups.map((g) => (
        <OptionGroupCard key={g.id} packageId={packageId} group={g} />
      ))}
      <form onSubmit={addGroup} className="flex items-end gap-2 rounded-2xl border border-dashed border-border bg-surfaceMuted p-4">
        <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
          New option group
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. Tax software"
            className={`mt-1 w-full ${inputClass}`}
          />
        </label>
        <Button type="submit" disabled={saving || !newGroupName.trim()}>
          <Plus size={14} aria-hidden="true" /> Add group
        </Button>
      </form>
    </div>
  );
}
