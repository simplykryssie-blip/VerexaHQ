import { SettingsNav } from "./SettingsNav";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Configure your workspace." />
      <div className="flex flex-1 overflow-hidden">
        <SettingsNav />
        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
      </div>
    </>
  );
}
