"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";

export type ManagedCourse = { id: string; title: string; status: string; display_order: number };

export function CourseManageList({ workspaceId, courses }: { workspaceId: string; courses: ManagedCourse[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("learning_courses")
      .insert({ owner_workspace_id: workspaceId, title: title.trim(), display_order: courses.length })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.show(error?.message ?? "Could not create the course", "error");
      return;
    }
    router.push(`/learning/manage/${data.id}`);
  }

  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course and all its modules? This can't be undone.")) return;
    setDeletingId(id);
    const { error } = await supabase.from("learning_courses").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Course deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          <Plus size={14} /> New course
        </button>
      </div>

      {creating && (
        <form onSubmit={createCourse} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Course title"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {courses.length === 0 ? (
        <EmptyState message="No courses yet -- create your first one above." />
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
          {courses.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/learning/manage/${c.id}`} className="flex items-center gap-2 text-sm font-medium text-ink hover:text-accent">
                {c.title}
                <Badge tone={c.status === "published" ? "success" : "neutral"}>{c.status}</Badge>
              </Link>
              <button
                type="button"
                onClick={() => deleteCourse(c.id)}
                disabled={deletingId === c.id}
                className="rounded p-1 text-muted hover:text-danger disabled:opacity-50"
                aria-label="Delete course"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
