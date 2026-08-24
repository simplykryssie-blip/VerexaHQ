import { RichTextEditor } from "@/components/settings/RichTextEditor";

export function RichTextSection({ config }: { config: { html?: string } }) {
  if (!config.html) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <RichTextEditor content={config.html} editable={false} bare />
    </section>
  );
}
