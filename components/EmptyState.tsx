import type { LucideIcon } from "lucide-react";

export function EmptyState({
  message,
  icon: Icon,
  action,
}: {
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      {Icon && (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted text-muted">
          <Icon size={16} aria-hidden="true" />
        </div>
      )}
      <p className="text-sm text-muted">{message}</p>
      {action}
    </div>
  );
}
