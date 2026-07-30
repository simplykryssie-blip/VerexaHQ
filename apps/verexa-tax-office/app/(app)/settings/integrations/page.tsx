import { redirect } from "next/navigation";
import { PhoneOff, MailX, VideoOff, CreditCard } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { roleHasCapability } from "@/lib/permissions/capabilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const INTEGRATIONS = [
  {
    key: "twilio",
    name: "Twilio",
    description: "SMS reminders and text messaging.",
    icon: PhoneOff,
    envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
  },
  {
    key: "resend",
    name: "Resend",
    description: "Transactional and marketing email delivery.",
    icon: MailX,
    envVars: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
  },
  {
    key: "zoom",
    name: "Zoom",
    description: "Video meeting links for video appointments.",
    icon: VideoOff,
    envVars: ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"],
  },
  {
    key: "payments",
    name: "Payment processor",
    description: "Card and ACH payment collection on invoices.",
    icon: CreditCard,
    envVars: ["STRIPE_SECRET_KEY"],
  },
];

export default async function IntegrationsPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (!roleHasCapability(active.role, "manage_integrations")) redirect("/unauthorized");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing here is connected yet. Every feature that depends on these providers shows an explicit &ldquo;not connected&rdquo; state instead of failing silently.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration) => {
          const connected = integration.envVars.every((v) => !!process.env[v]);
          const Icon = integration.icon;
          return (
            <Card key={integration.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{integration.name}</CardTitle>
                </div>
                <Badge variant={connected ? "success" : "outline"}>{connected ? "Connected" : "Not Connected"}</Badge>
              </CardHeader>
              <CardContent>
                <CardDescription>{integration.description}</CardDescription>
                {!connected && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Requires: <code className="text-[11px]">{integration.envVars.join(", ")}</code>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
