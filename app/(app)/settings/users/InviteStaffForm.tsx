"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InlineAddForm } from "@/components/InlineAddForm";

export function InviteStaffForm({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);

  return (
    <div>
      <InlineAddForm
        label="Invite Staff"
        fields={[
          { name: "email", label: "Email", type: "email", required: true },
          {
            name: "role_id",
            label: "Role",
            type: "select",
            required: true,
            options: roles.map((r) => ({ value: r.id, label: r.name })),
          },
        ]}
        onSubmit={async (v) => {
          setLastAcceptUrl(null);
          setLastNote(null);

          const res = await fetch("/api/invitations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: v.email, roleId: v.role_id }),
          });
          const data = await res.json();

          if (!res.ok) return data.error ?? "Could not send invitation.";

          if (data.email?.sent) {
            setLastNote(`Invitation emailed to ${v.email}.`);
          } else {
            setLastAcceptUrl(data.acceptUrl);
            setLastNote(
              `Invitation created for ${v.email}, but email delivery isn't configured yet -- share this link with them directly:`
            );
          }

          router.refresh();
        }}
      />

      {lastNote && (
        <div className="mt-3 rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
          <p>{lastNote}</p>
          {lastAcceptUrl && (
            <p className="mt-1 break-all font-mono text-xs text-accent">{lastAcceptUrl}</p>
          )}
        </div>
      )}
    </div>
  );
}
