"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { InvoiceQuoteForm } from "./InvoiceQuoteForm";
import { ClientPickerField, clientOptionLabel, type ClientOption } from "./ClientPickerField";

export function NewBillingDocumentModal({
  kind,
  workspaceId,
  firmName,
  services,
  onClose,
}: {
  kind: "invoice" | "quote";
  workspaceId: string;
  firmName: string;
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [client, setClient] = useState<ClientOption | null>(null);

  return (
    <Modal title={kind === "invoice" ? "New invoice" : "New quote"} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Client</label>
          <ClientPickerField workspaceId={workspaceId} selected={client} onSelect={setClient} />
        </div>

        {client && (
          <div className="border-t border-border pt-4">
            <InvoiceQuoteForm
              kind={kind}
              workspaceId={workspaceId}
              clientId={client.id}
              firmName={firmName}
              clientName={clientOptionLabel(client)}
              services={services}
              onDone={onClose}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
