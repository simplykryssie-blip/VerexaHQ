export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`rounded-2xl border border-border bg-surface shadow-soft ${padded ? "p-5" : ""} ${className}`}>{children}</div>;
}
