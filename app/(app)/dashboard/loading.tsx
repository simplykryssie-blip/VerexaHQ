import { PageHeader } from "@/components/PageHeader";
import { DashboardSkeleton } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardSkeleton />
    </>
  );
}
