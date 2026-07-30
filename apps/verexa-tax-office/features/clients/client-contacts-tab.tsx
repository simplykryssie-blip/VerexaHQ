"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import type { Tables } from "@/types/database";
import { Loader2, Plus } from "lucide-react";

type ClientContact = Tables<"client_contacts">;

const CONTACT_TYPES = ["personal", "business", "spouse", "authorized_contact", "emergency", "other"] as const;

export function ClientContactsTab({
  clientId,
  workspaceId,
  contacts,
}: {
  clientId: string;
  workspaceId: string;
  contacts: ClientContact[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    contactType: "personal" as (typeof CONTACT_TYPES)[number],
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  async function addContact() {
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("client_contacts").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      contact_type: form.contactType,
      first_name: form.firstName || null,
      last_name: form.lastName || null,
      email: form.email || null,
      phone: form.phone || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Contact added");
    setAdding(false);
    setForm({ contactType: "personal", firstName: "", lastName: "", email: "", phone: "" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Contacts</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Add contact
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="First name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
              <Input
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                placeholder="Phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <Select value={form.contactType} onValueChange={(v) => setForm({ ...form, contactType: v as typeof form.contactType })}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="brand" size="sm" onClick={addContact} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save contact
            </Button>
          </div>
        )}

        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional contacts yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium">
                    {c.first_name || c.last_name ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : c.label || "Contact"}
                  </div>
                  <div className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <div className="flex items-center gap-2">
                  {c.is_primary && <Badge variant="success">Primary</Badge>}
                  <Badge variant="outline" className="capitalize">
                    {c.contact_type.replace("_", " ")}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
