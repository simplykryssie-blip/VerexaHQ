import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UserCircle } from "lucide-react";
import { ZoomConnectionCard } from "@/components/settings/ZoomConnectionCard";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export const dynamic = "force-dynamic";

export default async function MyAccountPage({
  searchParams,
}: {
  searchParams: { zoom_error?: string; zoom_connected?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: connection } = await supabase
    .from("user_zoom_connections")
    .select("status, zoom_email")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={UserCircle}
        title="My Account"
        description="Personal connections and preferences -- these are yours alone, not shared with the rest of your workspace."
      />

      <h3 className="mt-6 text-sm font-semibold text-ink">Video meetings</h3>
      <div className="mt-3">
        <ZoomConnectionCard
          status={(connection?.status as "connected" | "disconnected" | "revoked" | undefined) ?? "not_connected"}
          zoomEmail={connection?.zoom_email ?? null}
          error={searchParams.zoom_error ?? null}
        />
      </div>
    </div>
  );
}
