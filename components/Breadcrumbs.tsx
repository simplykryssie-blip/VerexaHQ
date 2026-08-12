"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STATIC_ROUTE_LABELS, ENTITY_RESOLVERS, ID_SEGMENT } from "@/lib/breadcrumbs";

type Crumb = { href: string; label: string; isLast: boolean };

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const [entityLabels, setEntityLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const idSegments = segments
      .map((seg, i) => ({ seg, parentKey: segments[i - 1] }))
      .filter(({ seg, parentKey }) => ID_SEGMENT.test(seg) && parentKey in ENTITY_RESOLVERS);

    if (idSegments.length === 0) return;

    const supabase = createClient();
    let cancelled = false;

    idSegments.forEach(async ({ seg, parentKey }) => {
      const resolver = ENTITY_RESOLVERS[parentKey];
      // Table name is chosen dynamically from route config, so it can't be a literal Supabase generates a type for.
      const { data } = await supabase
        .from(resolver.table as never)
        .select(resolver.select)
        .eq("id", seg)
        .maybeSingle();
      if (!cancelled && data) {
        setEntityLabels((prev) => ({ ...prev, [seg]: resolver.label(data as unknown as Record<string, unknown>) }));
      }
    });

    return () => {
      cancelled = true;
    };
    // Re-resolve only when the path actually changes -- segments is derived from pathname each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) return null;

  let hrefAcc = "";
  const crumbs: Crumb[] = segments.map((seg, i) => {
    hrefAcc += `/${seg}`;
    const isId = ID_SEGMENT.test(seg);
    const label = isId ? entityLabels[seg] ?? "…" : STATIC_ROUTE_LABELS[seg] ?? decodeURIComponent(seg);
    return { href: hrefAcc, label, isLast: i === segments.length - 1 };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-sm">
      <Link href="/dashboard" className="shrink-0 text-muted hover:text-ink">
        Dashboard
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1.5">
          <ChevronRight size={13} className="shrink-0 text-border" aria-hidden="true" />
          {c.isLast ? (
            <span className="max-w-[240px] truncate font-medium text-ink" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="max-w-[160px] truncate text-muted hover:text-ink">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
