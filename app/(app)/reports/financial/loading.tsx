import { PageHeader } from "@/components/PageHeader";
import { ReportSkeleton } from "@/components/Skeleton";

export default function FinancialReportLoading() {
  return (
    <>
      <PageHeader title="Revenue" />
      <ReportSkeleton />
    </>
  );
}
