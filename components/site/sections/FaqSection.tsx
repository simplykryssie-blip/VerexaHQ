type FaqConfig = { items?: { question: string; answer: string }[] };

export function FaqSection({ config }: { config: FaqConfig }) {
  const items = config.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="divide-y divide-border rounded-2xl border border-border">
        {items.map((item, i) => (
          <details key={i} className="p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{item.question}</summary>
            <p className="mt-2 text-sm text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
