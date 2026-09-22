import type { PackageOption } from "../types";

const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type PackagesConfig = {
  package_ids?: string[];
};

export function PackagesEditor({
  config,
  onChange,
  packages,
}: {
  config: PackagesConfig;
  onChange: (patch: Partial<PackagesConfig>) => void;
  packages: PackageOption[];
}) {
  const selected = new Set(config.package_ids ?? []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ package_ids: Array.from(next) });
  }

  if (packages.length === 0) {
    return <p className="text-xs text-muted">No published packages yet -- set one up under Settings &gt; Packages first.</p>;
  }

  return (
    <div className="space-y-3">
      <p className={labelClass}>Select packages</p>
      <div className="space-y-2">
        {packages.map((pkg) => (
          <label key={pkg.id} className="flex items-start gap-2 text-sm text-slate">
            <input type="checkbox" checked={selected.has(pkg.id)} onChange={() => toggle(pkg.id)} className="mt-0.5" />
            <span>
              {pkg.name}
              {pkg.flat_price != null && <span className="ml-1 text-xs text-muted">(${pkg.flat_price})</span>}
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        Each selected package renders as its own card with the price and description currently set in Settings &gt; Packages -- updating a package
        there updates the website automatically.
      </p>
    </div>
  );
}
