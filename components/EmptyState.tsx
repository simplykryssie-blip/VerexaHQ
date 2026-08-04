export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      <p className="text-sm text-muted">{message}</p>
      {action}
    </div>
  );
}
