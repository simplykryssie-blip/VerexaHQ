import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "@/components/portal/ProfileForm";
import { BasicInfoForm, type BasicInfoSnapshot } from "@/components/portal/BasicInfoForm";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, { data: snapshot }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("first_name, last_name, display_name")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase.rpc("get_portal_client_snapshot"),
  ]);

  return (
    <>
      <PageHeader title="Profile" description={`Signed in as ${user?.email ?? ""} -- representing ${identity.clientLabel}.`} />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface shadow-soft p-4">
          <h2 className="text-sm font-semibold text-ink">Your info</h2>
          <p className="mt-1 text-sm text-muted">Name, phone, email, and mailing address on file for {identity.clientLabel}.</p>
          <div className="mt-4">
            <BasicInfoForm snapshot={(snapshot as BasicInfoSnapshot) ?? ({} as BasicInfoSnapshot)} mode="profile" />
          </div>
        </div>

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
