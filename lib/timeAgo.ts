// A year-plus-old timestamp reads as abandoned/stale rather than a real
// moment, so this only needs to distinguish "recent" from "a while" -- it
// falls back to a plain date past 30 days rather than "11mo ago".
export function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
