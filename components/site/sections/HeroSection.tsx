type HeroConfig = { heading?: string; subheading?: string; background_image_url?: string; button_label?: string; button_href?: string };

export function HeroSection({ config, accentColor }: { config: HeroConfig; accentColor?: string }) {
  return (
    <section
      className="relative flex flex-col items-center justify-center gap-4 px-6 py-24 text-center"
      style={
        config.background_image_url
          ? { backgroundImage: `url(${config.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
          : undefined
      }
    >
      {config.background_image_url && <div className="absolute inset-0 bg-black/40" />}
      <div className={`relative z-10 max-w-2xl ${config.background_image_url ? "text-white" : "text-ink"}`}>
        {config.heading && <h1 className="text-4xl font-bold">{config.heading}</h1>}
        {config.subheading && <p className="mt-4 text-lg opacity-90">{config.subheading}</p>}
        {config.button_label && config.button_href && (
          <a
            href={config.button_href}
            className="mt-8 inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: accentColor || "#0f172a" }}
          >
            {config.button_label}
          </a>
        )}
      </div>
    </section>
  );
}
