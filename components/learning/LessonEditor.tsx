"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { RichTextEditor } from "@/components/settings/RichTextEditor";

export function LessonEditor({
  moduleId,
  title,
  body,
  videoUrl,
}: {
  moduleId: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [titleValue, setTitleValue] = useState(title);
  const [bodyValue, setBodyValue] = useState(body ?? "");
  const [videoUrlValue, setVideoUrlValue] = useState(videoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("learning_modules")
      .update({ title: titleValue, body: bodyValue || null, video_url: videoUrlValue || null })
      .eq("id", moduleId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted">
          Title
          <input
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.target.value);
              setDirty(true);
            }}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-muted">
          Video URL (optional)
          <input
            value={videoUrlValue}
            onChange={(e) => {
              setVideoUrlValue(e.target.value);
              setDirty(true);
            }}
            placeholder="https://youtube.com/watch?v=..."
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-muted">Lesson content</p>
      <RichTextEditor
        content={bodyValue}
        onChange={(html) => {
          setBodyValue(html);
          setDirty(true);
        }}
      />

      <button
        type="button"
        onClick={save}
        disabled={saving || !dirty}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
