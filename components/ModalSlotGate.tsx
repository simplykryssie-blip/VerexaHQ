"use client";

import { usePathname } from "next/navigation";

// The @modal parallel-route slot only ever has one intercepted route today
// -- (.)clients/[id] -- but Next.js doesn't reliably fall back to its
// default.tsx (null) when you navigate forward from an open intercepted
// route to a completely different top-level route (e.g. clicking through
// from the Clients quick-view drawer to /organizers/[id]/review): the
// parallel slot can keep rendering the drawer's last content on top of the
// new page instead of clearing, and the drawer's own close button
// (router.back()) then appears to "close" whatever page you navigated to,
// since it's really just popping that in-between history entry. Rather than
// depend on Next's own reconciliation for every possible destination route,
// force the slot closed outright whenever the URL isn't a /clients/[id]
// shape the drawer could legitimately be showing.
export function ModalSlotGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!/^\/clients\/[^/]+\/?$/.test(pathname)) return null;
  return <>{children}</>;
}
