"use client";

// Shown right after a new email/SMS/organizer/engagement-letter template is
// created, so publishing is a deliberate choice instead of a template
// silently sitting in draft (unselectable in services/workflows) until
// someone notices and flips it later.
export function PublishConfirmModal({
  templateName,
  publishing,
  onPublish,
  onSkip,
}: {
  templateName: string;
  publishing: boolean;
  onPublish: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-softHover">
        <h2 className="font-display text-sm font-semibold text-ink">Publish &quot;{templateName}&quot;?</h2>
        <p className="mt-2 text-sm text-muted">
          Published templates can be selected in services, workflows, and other automations. You can publish it later from the template list instead.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={publishing}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
          >
            Keep as draft
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {publishing ? "Publishing..." : "Publish now"}
          </button>
        </div>
      </div>
    </div>
  );
}
