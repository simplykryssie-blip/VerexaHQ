import Link from "next/link";

export default function CustomDomainNotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-3 text-muted">This page may have moved, or the link may be incorrect.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white">
        Return to homepage
      </Link>
    </main>
  );
}
