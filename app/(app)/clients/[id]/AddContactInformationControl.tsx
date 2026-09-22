"use client";

import { useState } from "react";
import { Plus, ChevronDown, Mail, Phone, MapPin } from "lucide-react";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";
import { AddEmailForm, AddPhoneForm } from "./ContactChannelForms";
import { AddAddressForm } from "./AddForms";

type ContactMethodType = "email" | "phone" | "address";

const METHOD_OPTIONS: { value: ContactMethodType; label: string; icon: typeof Mail }[] = [
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "address", label: "Address", icon: MapPin },
];

/** Contacts Pass 2: replaces the three separate "Add Email" / "Add Phone" /
 *  "Add Address" triggers with one unified control. Reuses AddEmailForm /
 *  AddPhoneForm / AddAddressForm exactly as they already are -- same
 *  tables, same RPCs/direct-table calls, same permission checks, same
 *  primary-designation behavior -- this component only decides which one
 *  of the three is visible at a time via InlineAddForm's controlled-open
 *  mode, no new Contact-method storage or mutation path. */
export function AddContactInformationControl({ clientId, workspaceId }: { clientId: string; workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ContactMethodType | null>(null);
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="mb-4">
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Plus size={14} aria-hidden="true" /> Add Contact Information <ChevronDown size={13} aria-hidden="true" />
        </button>
        {open && (
          <DropdownPanel className="left-0 mt-1 w-44 p-1.5">
            {METHOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setActive(option.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate transition hover:bg-surfaceMuted"
              >
                <option.icon size={13} aria-hidden="true" className="text-muted" />
                {option.label}
              </button>
            ))}
          </DropdownPanel>
        )}
      </div>

      {active && (
        <div className="mt-3">
          <AddEmailForm
            clientId={clientId}
            workspaceId={workspaceId}
            open={active === "email"}
            onOpenChange={(next) => setActive(next ? "email" : null)}
          />
          <AddPhoneForm
            clientId={clientId}
            workspaceId={workspaceId}
            open={active === "phone"}
            onOpenChange={(next) => setActive(next ? "phone" : null)}
          />
          <AddAddressForm
            clientId={clientId}
            workspaceId={workspaceId}
            open={active === "address"}
            onOpenChange={(next) => setActive(next ? "address" : null)}
          />
        </div>
      )}
    </div>
  );
}
