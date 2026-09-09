// Static stand-in for a section that would otherwise call a real, unsaved
// lead-capture, organizer-submit, or booking RPC (see SectionRenderer.tsx's
// previewMode branch and SectionPreview.tsx) -- shown instead of the live
// component so a staff preview can never actually submit something.
export function PreviewOnlyNotice({ title, note }: { title: string; note: string }) {
  return (
    <section className="mx-auto max-w-lg px-6 py-12">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">{note}</p>
      </div>
    </section>
  );
}
