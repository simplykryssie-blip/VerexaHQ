import { Logo } from "@/components/logo";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-secondary/40 flex flex-col">
      <div className="bg-brand-gradient h-1.5 w-full" />
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="mb-8">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
