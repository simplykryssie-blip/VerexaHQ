import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "@/components/portal/ProfileForm";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, display_name")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return (
    <>
      <PageHeader title="Profile" description={`Signed in as ${user?.email ?? ""} -- representing ${identity.clientLabel}.`} />
      <div className="flex-1 px-8 py-6">
        <ProfileForm
          userId={user?.id ?? ""}
          firstName={profile?.first_name ?? null}
          lastName={profile?.last_name ?? null}
          displayName={profile?.display_name ?? null}
        />
      </div>
    </>
  );
}
