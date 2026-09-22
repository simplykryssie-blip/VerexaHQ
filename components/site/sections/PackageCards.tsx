export type PackageCardData = {
  id: string;
  name: string;
  description: string | null;
  flat_price: number | null;
  billing_cadence: string | null;
  stripe_payment_link_url: string | null;
};

const CADENCE_SUFFIX: Record<string, string> = { monthly: "/mo", annual: "/yr", one_time: "" };

// Shared between the live public render (PackagesSection, which fetches
// current package data at request time) and the in-builder preview
// (SectionPreview, which already has the workspace's package list loaded
// server-side and needs no extra fetch) so both ever show exactly one card
// layout. A package with no Stripe Payment Link mapped yet shows a disabled
// state rather than a broken/dead "Purchase Now" -- see PLATFORM notes on
// package lifecycle in the Packages settings page.
export function PackageCards({ packages }: { packages: PackageCardData[] }) {
  if (packages.length === 0) {
    return <p className="text-center text-sm text-muted">No packages are available right now.</p>;
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-6 py-10 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => (
        <div key={pkg.id} className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="font-display text-lg font-semibold text-ink">{pkg.name}</p>
          {pkg.description && <p className="mt-2 flex-1 text-sm text-muted">{pkg.description}</p>}
          {pkg.flat_price != null && (
            <p className="mt-3 text-2xl font-semibold text-ink">
              ${pkg.flat_price.toLocaleString()}
              <span className="text-sm font-normal text-muted">{CADENCE_SUFFIX[pkg.billing_cadence ?? ""] ?? ""}</span>
            </p>
          )}
          {pkg.stripe_payment_link_url ? (
            <a
              href={pkg.stripe_payment_link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Purchase Now
            </a>
          ) : (
            <span className="mt-4 inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-surfaceMuted px-4 py-2 text-sm font-medium text-muted">
              Coming soon
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
