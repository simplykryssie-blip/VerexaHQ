import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { AuthShell, authStyles as styles } from "@/components/auth/AuthShell";
import { BasicInfoForm, type BasicInfoSnapshot } from "@/components/portal/BasicInfoForm";

export const dynamic = "force-dynamic";

const RAIL_FOOT = (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1L12 3v4c0 3.5-2.2 5.7-5 6.5C4.2 12.7 2 10.5 2 7V3l5-2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
    <span>Encrypted &amp; audit-logged, firm-side</span>
  </>
);

export default async function PortalBasicInfoPage({ searchParams }: { searchParams: { next?: string } }) {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: snapshot } = await supabase.rpc("get_portal_client_snapshot");
  const next = searchParams.next && searchParams.next.startsWith("/portal") ? searchParams.next : "/portal/dashboard";

  return (
    <AuthShell
      eyebrow="Client portal"
      railHeading="Let's confirm your info."
      railSub="Quick one-time step -- this keeps your contact details current and saves you retyping it on every form."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Your info</h1>
      <p className={styles.lede}>
        Signed in as {identity.clientLabel}. If anything here is already on file with your firm, changing it will need their
        approval before it takes effect.
      </p>
      <BasicInfoForm snapshot={(snapshot as BasicInfoSnapshot) ?? ({} as BasicInfoSnapshot)} next={next} />
    </AuthShell>
  );
}
