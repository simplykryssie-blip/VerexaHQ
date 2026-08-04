import { PageHeader } from "@/components/PageHeader";

export function ReportLayout({
  title,
  description,
  actions,
  filters,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      <div className="flex-1 space-y-4 px-8 py-6 print:px-0 print:py-0">
        {filters && <div className="print:hidden">{filters}</div>}
        {children}
      </div>
    </>
  );
}
