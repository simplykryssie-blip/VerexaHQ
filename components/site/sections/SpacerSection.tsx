type SpacerConfig = { height?: "sm" | "md" | "lg" };

export function SpacerSection({ config }: { config: SpacerConfig }) {
  const heightClass = config.height === "lg" ? "h-24" : config.height === "sm" ? "h-6" : "h-12";
  return <div className={heightClass} />;
}
