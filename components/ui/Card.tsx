export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`rounded-xl border border-border bg-surface ${padded ? "p-5" : ""} ${className}`}>{children}</div>;
}
