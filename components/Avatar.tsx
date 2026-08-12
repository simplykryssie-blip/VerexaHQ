function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const SIZES = { xs: 20, sm: 24, md: 32, lg: 48 } as const;

export function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? "Avatar"}
        width={px}
        height={px}
        style={{ width: px, height: px, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: px, height: px, fontSize: px * 0.4, flexShrink: 0 }}
      className="inline-flex items-center justify-center rounded-full bg-accentSoft font-semibold text-accent"
    >
      {initialsFor(name)}
    </span>
  );
}
