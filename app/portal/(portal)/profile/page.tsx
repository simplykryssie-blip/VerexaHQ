import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { BasicInfoForm, type BasicInfoSnapshot } from "@/components/portal/BasicInfoForm";
import { RequestServiceCard } from "@/components/portal/RequestServiceCard";

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
      .select("display_name")
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
            <BasicInfoForm
              snapshot={(snapshot as BasicInfoSnapshot) ?? ({} as BasicInfoSnapshot)}
              mode="profile"
              userId={user?.id}
              displayName={profile?.display_name}
            />
          </div>
        </div>
        <RequestServiceCard requestedServiceIds={(snapshot as BasicInfoSnapshot | null)?.service_ids ?? []} />
      </div>
    </>
  );
}
