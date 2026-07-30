"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { CONTACT_METHODS } from "@/lib/validation/clients";
import type { Tables } from "@/types/database";

export function PortalProfileForm({
  clientId,
  phone,
  preferredContactMethod,
  address,
}: {
  clientId: string;
  phone: string | null;
  preferredContactMethod: string | null;
  address: Tables<"client_addresses"> | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [method, setMethod] = useState(preferredContactMethod ?? "email");
  const [line1, setLine1] = useState(address?.line1 ?? "");
  const [line2, setLine2] = useState(address?.line2 ?? "");
  const [city, setCity] = useState(address?.city ?? "");
  const [state, setState] = useState(address?.state ?? "");
  const [postalCode, setPostalCode] = useState(address?.postal_code ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  async function saveContact() {
    setSavingContact(true);
    const { error } = await supabase.rpc("update_client_portal_contact_info", {
      p_client_id: clientId,
      p_phone: phoneValue,
      p_preferred_contact_method: method as never,
    });
    setSavingContact(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Contact info updated");
    router.refresh();
  }

  async function saveAddress() {
    setSavingAddress(true);
    const { error } = await supabase.rpc("update_client_mailing_address", {
      p_client_id: clientId,
      p_line1: line1,
      p_line2: line2,
      p_city: city,
      p_state: state,
      p_postal_code: postalCode,
    });
    setSavingAddress(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Mailing address updated");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact info</CardTitle>
          <CardDescription>Your name and email are managed by your tax office. Contact support if they need to change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} placeholder="(555) 555-5555" />
            </div>
            <div className="space-y-1">
              <Label>Preferred contact method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button variant="brand" size="sm" disabled={savingContact} onClick={saveContact}>
            {savingContact && <Loader2 className="h-4 w-4 animate-spin" />}
            Save contact info
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mailing address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Address line 1</Label>
            <Input value={line1} onChange={(e) => setLine1(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Address line 2</Label>
            <Input value={line2} onChange={(e) => setLine2(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Postal code</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
          </div>
          <Button variant="brand" size="sm" disabled={savingAddress || !line1 || !city} onClick={saveAddress}>
            {savingAddress && <Loader2 className="h-4 w-4 animate-spin" />}
            Save address
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
