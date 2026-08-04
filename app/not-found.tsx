import Link from "next/link";

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link
          href="/dashboard"
          className="mt-4 block w-full rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-accent/90"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
