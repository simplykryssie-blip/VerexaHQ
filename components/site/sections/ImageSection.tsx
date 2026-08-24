type ImageConfig = { image_url?: string; alt_text?: string; caption?: string; alignment?: "left" | "center" | "right" };

export function ImageSection({ config }: { config: ImageConfig }) {
  if (!config.image_url) return null;
  const align = config.alignment === "left" ? "items-start" : config.alignment === "right" ? "items-end" : "items-center";
  return (
    <section className={`flex flex-col ${align} px-6 py-12`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={config.image_url} alt={config.alt_text ?? ""} className="max-w-full rounded-2xl" />
      {config.caption && <p className="mt-2 text-sm text-muted">{config.caption}</p>}
    </section>
  );
}
