"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { RichTextEditor } from "@/components/settings/RichTextEditor";
import { VideoUpload } from "@/components/learning/VideoUpload";

export function LessonEditor({
  ownerWorkspaceId,
  moduleId,
  title,
  body,
  videoUrl,
  videoStoragePath,
}: {
  ownerWorkspaceId: string;
  moduleId: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
  videoStoragePath: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [titleValue, setTitleValue] = useState(title);
  const [bodyValue, setBodyValue] = useState(body ?? "");
  const [videoUrlValue, setVideoUrlValue] = useState(videoUrl ?? "");
  const [videoStoragePathValue, setVideoStoragePathValue] = useState(videoStoragePath);
  const [videoMode, setVideoMode] = useState<"upload" | "link">(videoStoragePath ? "upload" : "link");
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

  async function onVideoStoragePathChange(path: string | null) {
    setVideoStoragePathValue(path);
    // The storage object already changed (uploaded/removed) by the time this
    // fires -- persist the pointer immediately rather than waiting on Save,
    // so a lost/errored later save can't leave the DB out of sync with what's
    // actually sitting in the bucket.
    const { error } = await supabase
      .from("learning_modules")
      .update({ video_storage_path: path, video_url: path ? null : videoUrlValue || null })
      .eq("id", moduleId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    if (path) setVideoUrlValue("");
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

        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Video (optional)</p>
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              onClick={() => setVideoMode("upload")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                videoMode === "upload" ? "bg-accentSoft text-accent" : "text-muted hover:text-slate"
              }`}
            >
              Upload a video
            </button>
            <button
              type="button"
              onClick={() => setVideoMode("link")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                videoMode === "link" ? "bg-accentSoft text-accent" : "text-muted hover:text-slate"
              }`}
            >
              Paste a link
            </button>
          </div>

          {videoMode === "upload" ? (
            <div className="mt-2">
              <VideoUpload ownerWorkspaceId={ownerWorkspaceId} moduleId={moduleId} value={videoStoragePathValue} onChange={onVideoStoragePathChange} />
              <p className="mt-1 text-[11px] text-muted">Hosted directly in Verexa -- up to 500MB. MP4, WebM, MOV, AVI, or OGG.</p>
            </div>
          ) : (
            <input
              value={videoUrlValue}
              onChange={(e) => {
                setVideoUrlValue(e.target.value);
                setDirty(true);
              }}
              placeholder="https://youtube.com/watch?v=..."
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
        </div>
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
