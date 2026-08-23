"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { RichTextEditor } from "@/components/settings/RichTextEditor";

function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export function LessonViewer({
  moduleId,
  body,
  videoUrl,
  alreadyComplete,
}: {
  moduleId: string;
  body: string | null;
  videoUrl: string | null;
  alreadyComplete: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [complete, setComplete] = useState(alreadyComplete);
  const [saving, setSaving] = useState(false);
  const embed = videoUrl ? embedUrl(videoUrl) : null;

  async function markComplete() {
    setSaving(true);
    const { error } = await supabase.rpc("mark_lesson_complete", { p_module_id: moduleId });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setComplete(true);
    toast.show("Marked complete", "success");
  }

  return (
    <div className="space-y-4">
      {videoUrl && (
        <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-soft">
          {embed ? (
            <div className="aspect-video">
              <iframe src={embed} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            </div>
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={videoUrl} controls className="aspect-video w-full" />
          )}
        </div>
      )}

      {body && (
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
          <RichTextEditor content={body} editable={false} bare />
        </div>
      )}

      <button
        type="button"
        onClick={markComplete}
        disabled={saving || complete}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        <CheckCircle2 size={15} />
        {complete ? "Completed" : saving ? "Saving..." : "Mark complete"}
      </button>
    </div>
  );
}
