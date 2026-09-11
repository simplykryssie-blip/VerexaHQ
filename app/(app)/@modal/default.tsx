// Parallel-route fallback: rendered for every page under (app) that doesn't
// have a matching intercepted route (i.e. everywhere except the Clients
// Quick-View drawer below) -- app/(app)/layout.tsx renders {modal} as a
// sibling of {children}, so this must resolve to nothing rather than a 404.
export default function ModalSlotDefault() {
  return null;
}
