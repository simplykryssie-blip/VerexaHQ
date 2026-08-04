import { PageHeader } from "@/components/PageHeader";
import { ReportSkeleton } from "@/components/Skeleton";

export default function DocumentsReportLoading() {
  return (
    <>
      <PageHeader title="Missing Documents" />
      <ReportSkeleton />
    </>
  );
}
