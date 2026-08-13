import { SettingsNav } from "./SettingsNav";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Configure your workspace." />
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <SettingsNav />
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-8">{children}</div>
      </div>
    </>
  );
}
