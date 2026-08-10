import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function BrandCenterPage() {
  redirect("/settings/firm-profile");
}
