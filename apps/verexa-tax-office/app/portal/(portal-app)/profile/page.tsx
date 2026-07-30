import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/auth/portal";
import { createClient } from "@/lib/supabase/server";
import { PortalProfileForm } from "@/features/portal/profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalProfilePage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const supabase = await createClient();
  const { data: address } = await supabase
    .from("client_addresses")
    .select("*")
    .eq("client_id", context.client.id)
    .eq("address_type", "mailing")
    .maybeSingle();

  const displayName = context.contactName ?? `${context.client.first_name} ${context.client.last_name}`.trim();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your contact information.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p>{displayName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p>{context.client.email}</p>
          </div>
        </CardContent>
      </Card>

      <PortalProfileForm
        clientId={context.client.id}
        phone={context.client.phone}
        preferredContactMethod={context.client.preferred_contact_method}
        address={address}
      />
    </div>
  );
}
