"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { InvoicePreview, type PreviewLineItem } from "./InvoicePreview";

export function PreviewButton({
  kind,
  workspaceId,
  firmName,
  clientName,
  number,
  issueDate,
  dueDate,
  lineItems,
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  notes,
  status,
}: {
  kind: "invoice" | "quote";
  workspaceId: string;
  firmName: string;
  clientName: string;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  lineItems: PreviewLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  status?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        Preview
      </button>
      {open && (
        <Modal title={kind === "invoice" ? "Invoice preview" : "Quote preview"} onClose={() => setOpen(false)} size="xl">
          <InvoicePreview
            kind={kind}
            workspaceId={workspaceId}
            firmName={firmName}
            clientName={clientName}
            number={number}
            issueDate={issueDate}
            dueDate={dueDate}
            lineItems={lineItems}
            subtotal={subtotal}
            discountAmount={discountAmount}
            taxAmount={taxAmount}
            totalAmount={totalAmount}
            notes={notes}
            status={status}
          />
        </Modal>
      )}
    </>
  );
}
