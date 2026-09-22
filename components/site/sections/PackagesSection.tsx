"use client";

import { useEffect, useState } from "react";
import { PackageCards, type PackageCardData } from "./PackageCards";

type PackagesConfig = {
  package_ids?: string[];
};

export function PackagesSection({ config, workspaceSlug }: { config: PackagesConfig; workspaceSlug: string }) {
  const [packages, setPackages] = useState<PackageCardData[] | null>(null);
  const ids = config.package_ids ?? [];

  useEffect(() => {
    if (ids.length === 0) {
      setPackages([]);
      return;
    }
    const params = new URLSearchParams({ workspaceSlug, ids: ids.join(",") });
    fetch(`/api/public/packages?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { packages: [] }))
      .then((data) => setPackages(data.packages ?? []))
      .catch(() => setPackages([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, ids.join(",")]);

  if (packages === null) return null;

  return <PackageCards packages={packages} />;
}
