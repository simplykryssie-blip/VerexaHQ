"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Trash2, Plus, BookOpen, CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

type Course = { id: string; title: string; description: string | null; status: string };
type ModuleRow = { id: string; title: string; module_type: string; display_order: number };

export function CourseEditor({ course, modules }: { course: Course; modules: ModuleRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [status, setStatus] = useState(course.status);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addingType, setAddingType] = useState<"lesson" | "quiz" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("learning_courses")
      .update({ title, description: description || null, status })
      .eq("id", course.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  async function addModule(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !addingType) return;
    const { error } = await supabase.from("learning_modules").insert({
      course_id: course.id,
      module_type: addingType,
      title: newTitle.trim(),
      display_order: modules.length,
    });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setNewTitle("");
    setAddingType(null);
    router.refresh();
  }

  async function deleteModule(id: string) {
    if (!window.confirm("Delete this module?")) return;
    const { error } = await supabase.from("learning_modules").delete().eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function move(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= modules.length) return;
    const a = modules[index];
    const b = modules[swapIndex];
    setReorderingId(a.id);
    const { error: err1 } = await supabase.from("learning_modules").update({ display_order: b.display_order }).eq("id", a.id);
    const { error: err2 } = await supabase.from("learning_modules").update({ display_order: a.display_order }).eq("id", b.id);
    setReorderingId(null);
    if (err1 || err2) {
      toast.show(err1?.message ?? err2?.message ?? "Could not reorder", "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-muted">
          Description
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDirty(true);
            }}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setDirty(true);
              }}
              className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Modules</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddingType("lesson")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <BookOpen size={14} /> Add lesson
          </button>
          <button
            type="button"
            onClick={() => setAddingType("quiz")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <CheckSquare size={14} /> Add quiz
          </button>
        </div>
      </div>

      {addingType && (
        <form onSubmit={addModule} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={addingType === "lesson" ? "Lesson title" : "Quiz title"}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            <Plus size={14} />
          </button>
        </form>
      )}

      {modules.length === 0 ? (
        <EmptyState message="No modules yet -- add a lesson or quiz above." />
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
          {modules.map((m, i) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/learning/manage/${course.id}/${m.id}`} className="flex items-center gap-2 text-sm font-medium text-ink hover:text-accent">
                {m.module_type === "quiz" ? <CheckSquare size={14} className="text-accent" /> : <BookOpen size={14} className="text-accent" />}
                {m.title}
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={i === 0 || reorderingId === m.id}
                  onClick={() => move(i, "up")}
                  className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={i === modules.length - 1 || reorderingId === m.id}
                  onClick={() => move(i, "down")}
                  className="rounded p-1 text-muted hover:bg-surfaceMuted disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => deleteModule(m.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Delete module">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
