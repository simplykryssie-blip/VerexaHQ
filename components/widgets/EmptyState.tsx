import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted text-muted">
        <Icon size={16} aria-hidden="true" />
      </div>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
