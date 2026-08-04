import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ComingSoon } from "@/components/ComingSoon";
import { REPORT_CATEGORIES } from "@/lib/reportCategories";
import { BarChart3 } from "lucide-react";

export default function ReportCategoryPage({ params }: { params: { slug: string } }) {
  const category = REPORT_CATEGORIES.find((c) => c.slug === params.slug);
  if (!category) notFound();

  return (
    <>
      <PageHeader title={category.title} description={category.description} />
      <ComingSoon
        icon={BarChart3}
        title={`${category.title} are on the way`}
        description="This report is being built against the live Verexa data model. Check back soon."
      />
    </>
  );
}
