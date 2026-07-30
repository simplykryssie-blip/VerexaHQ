import { Logo } from "@/components/logo";

export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-secondary/40 flex flex-col">
      <div className="bg-brand-gradient h-1.5 w-full" />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="mb-8">
          <Logo />
        </div>
        <div className="w-full max-w-sm">{children}</div>
        <p className="mt-8 text-xs text-muted-foreground text-center max-w-sm">
          This is your secure client portal. Your tax office can see the same information you see here — nothing more.
        </p>
      </div>
    </div>
  );
}
