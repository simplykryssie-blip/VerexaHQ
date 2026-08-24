type TestimonialConfig = { quote?: string; author_name?: string; author_title?: string; avatar_url?: string };

export function TestimonialSection({ config }: { config: TestimonialConfig }) {
  if (!config.quote) return null;
  return (
    <section className="mx-auto max-w-2xl px-6 py-12 text-center">
      <p className="text-lg italic text-ink">&ldquo;{config.quote}&rdquo;</p>
      <div className="mt-4 flex items-center justify-center gap-3">
        {config.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        )}
        <div className="text-left">
          {config.author_name && <p className="text-sm font-semibold text-ink">{config.author_name}</p>}
          {config.author_title && <p className="text-xs text-muted">{config.author_title}</p>}
        </div>
      </div>
    </section>
  );
}
