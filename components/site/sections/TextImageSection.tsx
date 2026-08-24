import { RichTextEditor } from "@/components/settings/RichTextEditor";

type TextImageConfig = { heading?: string; html?: string; image_url?: string; image_position?: "left" | "right" };

export function TextImageSection({ config }: { config: TextImageConfig }) {
  const imageFirst = config.image_position === "left";
  return (
    <section className="mx-auto grid max-w-5xl gap-8 px-6 py-12 md:grid-cols-2 md:items-center">
      {imageFirst && config.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.image_url} alt="" className="w-full rounded-2xl" />
      )}
      <div>
        {config.heading && <h2 className="text-2xl font-semibold text-ink">{config.heading}</h2>}
        {config.html && (
          <div className="mt-3">
            <RichTextEditor content={config.html} editable={false} bare />
          </div>
        )}
      </div>
      {!imageFirst && config.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.image_url} alt="" className="w-full rounded-2xl" />
      )}
    </section>
  );
}
