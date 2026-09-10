"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Plus, BookOpen, CheckSquare, Lock, Unlock, CalendarClock, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

type Course = { id: string; title: string; description: string | null; category: string | null; status: string };
type ModuleRow = {
  id: string;
  title: string;
  module_type: string;
  display_order: number;
  release_date: string | null;
  release_offset_days: number | null;
};
type LiveSessionInfo = { scheduledStart: string; isWebinar: boolean };

type ScheduleMode = "always" | "date" | "offset";

function scheduleMode(m: Pick<ModuleRow, "release_date" | "release_offset_days">): ScheduleMode {
  if (m.release_date !== null) return "date";
  if (m.release_offset_days !== null) return "offset";
  return "always";
}

function scheduleCaption(m: Pick<ModuleRow, "release_date" | "release_offset_days">): string {
  const mode = scheduleMode(m);
  if (mode === "date" && m.release_date) {
    return `Unlocks ${new Date(m.release_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (mode === "offset") {
    return `Unlocks ${m.release_offset_days} day${m.release_offset_days === 1 ? "" : "s"} after assignment`;
  }
  return "Always available";
}

export function CourseEditor({
  course,
  modules: initialModules,
  liveSessions = {},
}: {
  course: Course;
  modules: ModuleRow[];
  liveSessions?: Record<string, LiveSessionInfo>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [category, setCategory] = useState(course.category ?? "");
  const [status, setStatus] = useState(course.status);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addingType, setAddingType] = useState<"lesson" | "quiz" | "live_session" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [modules, setModules] = useState(initialModules);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  useEffect(() => setModules(initialModules), [initialModules]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("learning_courses")
      .update({ title, description: description || null, category: category.trim() || null, status })
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

  async function createLiveSession(payload: { title: string; scheduledStart: string; durationMinutes: number; isWebinar: boolean }) {
    const res = await fetch("/api/learning/live-sessions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: course.id, displayOrder: modules.length, ...payload }),
    });
    const data = (await res.json()) as { configured?: boolean; reason?: string; error?: string; fallbackNotice?: string | null };
    if (!res.ok) {
      toast.show(data.error ?? "Could not create live session", "error");
      return false;
    }
    if (!data.configured) {
      toast.show(data.reason ?? "Zoom isn't connected", "error");
      return false;
    }
    if (data.fallbackNotice) toast.show(data.fallbackNotice, "info");
    toast.show("Live session scheduled", "success");
    setAddingType(null);
    router.refresh();
    return true;
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

  async function saveSchedule(id: string, releaseDate: string | null, releaseOffsetDays: number | null) {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, release_date: releaseDate, release_offset_days: releaseOffsetDays } : m)));
    const { error } = await supabase
      .from("learning_modules")
      .update({ release_date: releaseDate, release_offset_days: releaseOffsetDays })
      .eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setSchedulingId(null);
    router.refresh();
  }

  const sortedModules = [...modules].sort((a, b) => a.display_order - b.display_order);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // A drag can end outside any tracked drop target -- clear the indicator
  // globally so an aborted drag never leaves a stale line on screen.
  useEffect(() => {
    function clear() {
      setDraggedId(null);
      setDropIndex(null);
    }
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  async function persistOrder(orderedIds: string[]) {
    setModules((prev) => prev.map((m) => ({ ...m, display_order: orderedIds.indexOf(m.id) })));
    const results = await Promise.all(
      orderedIds.map((id, index) => supabase.from("learning_modules").update({ display_order: index }).eq("id", id))
    );
    const err = results.find((r) => r.error)?.error;
    if (err) toast.show(err.message, "error");
    router.refresh();
  }

  function handleModuleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setDropIndex(isTopHalf ? index : index + 1);
  }

  function handleModuleDrop() {
    if (draggedId !== null && dropIndex !== null) {
      const currentOrder = sortedModules.map((m) => m.id);
      const fromIndex = currentOrder.indexOf(draggedId);
      if (fromIndex !== -1) {
        const without = currentOrder.filter((id) => id !== draggedId);
        const adjustedIndex = fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
        without.splice(adjustedIndex, 0, draggedId);
        persistOrder(without);
      }
    }
    setDraggedId(null);
    setDropIndex(null);
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
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-muted">
          Category
          <input
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setDirty(true);
            }}
            placeholder="e.g. Compliance, Software, Onboarding"
            className="mt-1 w-full max-w-xs rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
          <button
            type="button"
            onClick={() => setAddingType("live_session")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <Video size={14} /> Add live session
          </button>
        </div>
      </div>

      {(addingType === "lesson" || addingType === "quiz") && (
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

      {addingType === "live_session" && (
        <LiveSessionForm defaultTitle={course.title} onCancel={() => setAddingType(null)} onSubmit={createLiveSession} />
      )}

      {sortedModules.length === 0 ? (
        <EmptyState message="No modules yet -- add a lesson or quiz above." />
      ) : (
        <ul className="rounded-2xl border border-border bg-surface shadow-soft">
          {sortedModules.map((m, i) => (
            <li key={m.id}>
              {dropIndex === i && <div className="h-1 rounded-full bg-accent" aria-hidden="true" />}
              <div
                draggable
                onDragStart={() => setDraggedId(m.id)}
                onDragOver={(e) => handleModuleDragOver(e, i)}
                onDrop={handleModuleDrop}
                className={`border-b border-border px-4 py-3 last:border-b-0 cursor-grab active:cursor-grabbing ${
                  draggedId === m.id ? "opacity-40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {m.module_type === "live_session" ? (
                      <Link href={`/learning/manage/${course.id}`} className="flex items-center gap-2 text-sm font-medium text-ink">
                        <Video size={14} className="text-accent" />
                        {m.title}
                      </Link>
                    ) : (
                      <Link href={`/learning/manage/${course.id}/${m.id}`} className="flex items-center gap-2 text-sm font-medium text-ink hover:text-accent">
                        {m.module_type === "quiz" ? <CheckSquare size={14} className="text-accent" /> : <BookOpen size={14} className="text-accent" />}
                        {m.title}
                      </Link>
                    )}
                    {m.module_type === "live_session" && liveSessions[m.id] && (
                      <span className="text-[11px] text-muted">
                        {new Date(liveSessions[m.id].scheduledStart).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {liveSessions[m.id].isWebinar ? " · Webinar" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSchedulingId(schedulingId === m.id ? null : m.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
                        scheduleMode(m) === "always" ? "text-muted hover:bg-surfaceMuted" : "bg-accentSoft text-accent"
                      }`}
                    >
                      {scheduleMode(m) === "always" ? <Unlock size={12} /> : <Lock size={12} />}
                      {scheduleCaption(m)}
                    </button>
                    <button type="button" onClick={() => deleteModule(m.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Delete module">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {schedulingId === m.id && <ScheduleEditor module={m} onSave={saveSchedule} onCancel={() => setSchedulingId(null)} />}
              </div>
            </li>
          ))}
          {dropIndex === sortedModules.length && <div className="h-1 rounded-full bg-accent" aria-hidden="true" />}
        </ul>
      )}
    </div>
  );
}

function ScheduleEditor({
  module: m,
  onSave,
  onCancel,
}: {
  module: ModuleRow;
  onSave: (id: string, releaseDate: string | null, releaseOffsetDays: number | null) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<ScheduleMode>(scheduleMode(m));
  const [date, setDate] = useState(m.release_date ? m.release_date.slice(0, 10) : "");
  const [offsetDays, setOffsetDays] = useState(m.release_offset_days ?? 3);

  function submit() {
    if (mode === "always") return onSave(m.id, null, null);
    if (mode === "date") {
      if (!date) return;
      return onSave(m.id, new Date(`${date}T00:00:00`).toISOString(), null);
    }
    onSave(m.id, null, offsetDays);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surfaceMuted p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        <CalendarClock size={12} /> Availability
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`mode-${m.id}`} checked={mode === "always"} onChange={() => setMode("always")} />
          Always available
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`mode-${m.id}`} checked={mode === "date"} onChange={() => setMode("date")} />
          On a date
        </label>
        {mode === "date" && (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`mode-${m.id}`} checked={mode === "offset"} onChange={() => setMode("offset")} />
          Days after assignment
        </label>
        {mode === "offset" && (
          <input
            type="number"
            min={0}
            value={offsetDays}
            onChange={(e) => setOffsetDays(Math.max(0, Number(e.target.value)))}
            className="w-20 rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface">
          Cancel
        </button>
        <button type="button" onClick={submit} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
          Save
        </button>
      </div>
    </div>
  );
}

function LiveSessionForm({
  defaultTitle,
  onCancel,
  onSubmit,
}: {
  defaultTitle: string;
  onCancel: () => void;
  onSubmit: (payload: { title: string; scheduledStart: string; durationMinutes: number; isWebinar: boolean }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isWebinar, setIsWebinar] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !time) return;
    setSubmitting(true);
    const scheduledStart = new Date(`${date}T${time}`).toISOString();
    const ok = await onSubmit({ title: title.trim(), scheduledStart, durationMinutes, isWebinar });
    setSubmitting(false);
    if (!ok) return;
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Live session topic"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate">
          Duration
          <input
            type="number"
            min={15}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Math.max(15, Number(e.target.value)))}
            className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          min
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate">
          <input type="checkbox" checked={isWebinar} onChange={(e) => setIsWebinar(e.target.checked)} />
          Webinar
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-surfaceMuted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim() || !date || !time}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {submitting ? "Scheduling..." : "Schedule session"}
        </button>
      </div>
    </form>
  );
}
