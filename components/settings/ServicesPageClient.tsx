"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { Button } from "@/components/ui/Button";
import { ServiceLibrary, type ServiceCard, type ServiceCategoryOption } from "@/components/settings/ServiceLibrary";

export function ServicesPageClient({
  workspaceId,
  services,
  categories,
  canManage,
}: {
  workspaceId: string;
  services: ServiceCard[];
  categories: ServiceCategoryOption[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="max-w-4xl">
      <SettingsSectionHeader
        icon={Package}
        title="Services"
        description="What your firm offers. Each service routes to a pipeline and an organizer -- pricing, document templates, and other details are optional and tucked under Advanced."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              + New service
            </Button>
          )
        }
      />
      <div className="mt-4">
        <ServiceLibrary
          workspaceId={workspaceId}
          services={services}
          categories={categories}
          canManage={canManage}
          creating={creating}
          onCreatingChange={setCreating}
        />
      </div>
    </div>
  );
}
