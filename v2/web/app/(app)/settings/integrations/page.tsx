import { ComingSoon } from "@/components/ComingSoon";
import { Plug } from "lucide-react";

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Integrations</h2>
      <p className="mt-1 text-sm text-muted">Connect Verexa to the tools your firm already uses.</p>
      <div className="mt-6 rounded-xl border border-border bg-surface">
        <ComingSoon
          icon={Plug}
          title="Integrations are coming soon"
          description="No third-party integrations have been built yet -- this is where they'll live once they are."
        />
      </div>
    </div>
  );
}
