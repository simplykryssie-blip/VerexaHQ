"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Trash2, Plus, ImagePlus, X, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type SupportArticleRow = {
  id: string;
  section: "how_it_works" | "troubleshooting";
  title: string;
  body: string;
  image_url: string | null;
  display_order: number;
};

function ImagePicker({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("support-content").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    const { data } = supabase.storage.from("support-content").getPublicUrl(path);
    onChange(data.publicUrl);
  }

  return value ? (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} alt="" className="max-h-20 rounded-lg border border-border object-contain" />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:border-danger hover:text-danger"
      >
        <X size={12} /> Remove image
      </button>
    </div>
  ) : (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
      <ImagePlus size={14} />
      {uploading ? "Uploading..." : "Add a photo"}
      <input type="file" accept="image/*" disabled={uploading} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </label>
  );
}

function ArticleEditor({ article, onSaved, onCancel }: { article: SupportArticleRow; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState(article.body);
  const [imageUrl, setImageUrl] = useState(article.image_url);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("support_articles")
      .update({ title: title.trim(), body: body.trim(), image_url: imageUrl })
      .eq("id", article.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Saved", "success");
    onSaved();
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <ImagePicker value={imageUrl} onChange={setImageUrl} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !title.trim() || !body.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SectionManager({ section, title, articles }: { section: SupportArticleRow["section"]; title: string; articles: SupportArticleRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    setEditingId(null);
    router.refresh();
  }

  async function addArticle() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("support_articles")
      .insert({ section, title: newTitle.trim(), body: newBody.trim(), display_order: articles.length });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewTitle("");
    setNewBody("");
    setAdding(false);
    refresh();
  }

  async function deleteArticle(id: string) {
    if (!window.confirm("Delete this article?")) return;
    const { error } = await supabase.from("support_articles").delete().eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    refresh();
  }

  async function move(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= articles.length) return;
    const a = articles[index];
    const b = articles[swapIndex];
    const { error: err1 } = await supabase.from("support_articles").update({ display_order: b.display_order }).eq("id", a.id);
    const { error: err2 } = await supabase.from("support_articles").update({ display_order: a.display_order }).eq("id", b.id);
    if (err1 || err2) {
      toast.show(err1?.message ?? err2?.message ?? "Could not reorder", "error");
      return;
    }
    refresh();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
        >
          <Plus size={14} /> Add article
        </button>
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Body"
            rows={4}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={addArticle}
            disabled={saving || !newTitle.trim() || !newBody.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      )}

      <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
        {articles.map((a, i) =>
          editingId === a.id ? (
            <ArticleEditor key={a.id} article={a} onSaved={refresh} onCancel={() => setEditingId(null)} />
          ) : (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="truncate text-sm font-medium text-ink">{a.title}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, "up")} className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30" aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={i === articles.length - 1}
                  onClick={() => move(i, "down")}
                  className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => setEditingId(a.id)} className="rounded p-1 text-muted hover:text-accent" aria-label="Edit">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => deleteArticle(a.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function SupportArticleManager({ articles }: { articles: SupportArticleRow[] }) {
  const howItWorks = articles.filter((a) => a.section === "how_it_works").sort((a, b) => a.display_order - b.display_order);
  const troubleshooting = articles.filter((a) => a.section === "troubleshooting").sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="space-y-8">
      <SectionManager section="how_it_works" title="How Verexa works" articles={howItWorks} />
      <SectionManager section="troubleshooting" title="Troubleshooting" articles={troubleshooting} />
    </div>
  );
}
