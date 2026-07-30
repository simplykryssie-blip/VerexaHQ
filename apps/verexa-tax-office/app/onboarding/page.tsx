import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserMemberships } from "@/lib/auth/workspace";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const memberships = await getUserMemberships();
  if (memberships.length > 0) redirect("/");

  return <OnboardingWizard />;
}
