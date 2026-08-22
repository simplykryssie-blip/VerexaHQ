import { ToastProvider } from "@/components/Toast";

// This page lives outside app/portal/(portal) on purpose -- it's a
// one-time gate shown before a client gets the full portal chrome, using
// the minimal AuthShell instead of PortalSidebar. But that also means it
// doesn't inherit (portal)/layout.tsx's <ToastProvider>, and BasicInfoForm
// calls useToast() on save -- which crashed with "useToast must be used
// within ToastProvider" for every client hitting Save here.
export default function PortalBasicInfoLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
