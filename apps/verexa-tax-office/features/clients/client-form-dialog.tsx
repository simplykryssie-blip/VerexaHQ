"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import {
  clientSchema,
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  type ClientInput,
} from "@/lib/validation/clients";
import { Loader2, Plus } from "lucide-react";

export function ClientFormDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: { clientType: "individual", status: "active", preferredLanguage: "en" },
  });

  const clientType = watch("clientType");
  const isBusiness = clientType === "business" || clientType === "organization";

  async function onSubmit(values: ClientInput) {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    if (!isBusiness && (!values.firstName || !values.lastName)) {
      setError("First and last name are required for this client type.");
      setSubmitting(false);
      return;
    }
    if (isBusiness && !values.company) {
      setError("Company name is required for this client type.");
      setSubmitting(false);
      return;
    }

    const primaryEmail = isBusiness ? values.businessEmail : values.personalEmail || values.businessEmail;
    const primaryPhone = isBusiness ? values.businessPhone : values.personalPhone || values.businessPhone;

    const { data: newClient, error: dbError } = await supabase
      .from("clients")
      .insert({
        workspace_id: workspaceId,
        client_type: values.clientType,
        first_name: values.firstName || values.company || "—",
        last_name: values.lastName || "",
        company: values.company || null,
        email: primaryEmail || null,
        phone: primaryPhone || null,
        preferred_contact_method: values.preferredContactMethod || null,
        preferred_language: values.preferredLanguage || "en",
        date_of_birth: values.dateOfBirth || null,
        ssn_last4: values.ssnLast4 || null,
        ein_last4: values.einLast4 || null,
        source: values.source || null,
        status: values.status,
        notes: values.notes || null,
      })
      .select("id")
      .single();

    if (dbError || !newClient) {
      setError(friendlyDbError(dbError?.message));
      setSubmitting(false);
      return;
    }

    // Personal and business contact info are stored as separate
    // client_contacts rows so one is never overwritten by the other.
    const contactRows = [];
    if (values.personalEmail || values.personalPhone) {
      contactRows.push({
        workspace_id: workspaceId,
        client_id: newClient.id,
        contact_type: "personal" as const,
        email: values.personalEmail || null,
        phone: values.personalPhone || null,
        is_primary: !isBusiness,
      });
    }
    if (values.businessEmail || values.businessPhone) {
      contactRows.push({
        workspace_id: workspaceId,
        client_id: newClient.id,
        contact_type: "business" as const,
        email: values.businessEmail || null,
        phone: values.businessPhone || null,
        is_primary: isBusiness,
      });
    }
    if (contactRows.length > 0) {
      await supabase.from("client_contacts").insert(contactRows);
    }

    setSubmitting(false);
    toast.success("Client created");
    setOpen(false);
    reset();
    router.push(`/clients/${newClient.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand">
          <Plus className="h-4 w-4" /> Add client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Client type</Label>
            <Select value={clientType} onValueChange={(v) => setValue("clientType", v as ClientInput["clientType"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CLIENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isBusiness ? (
            <div className="space-y-1">
              <Label>Company name</Label>
              <Input {...register("company")} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name</Label>
                <Input {...register("firstName")} />
              </div>
              <div className="space-y-1">
                <Label>Last name</Label>
                <Input {...register("lastName")} />
              </div>
            </div>
          )}

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Personal contact</div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Personal email" type="email" {...register("personalEmail")} />
              <Input placeholder="Personal phone" type="tel" {...register("personalPhone")} />
            </div>
          </div>
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Business contact</div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Business email" type="email" {...register("businessEmail")} />
              <Input placeholder="Business phone" type="tel" {...register("businessPhone")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date of birth</Label>
              <Input type="date" {...register("dateOfBirth")} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={watch("status")}
                onValueChange={(v) => setValue("status", v as ClientInput["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CLIENT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>SSN — last 4 digits</Label>
              <Input maxLength={4} {...register("ssnLast4")} placeholder="1234" />
              {errors.ssnLast4 && <p className="text-xs text-destructive">{errors.ssnLast4.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>EIN — last 4 digits</Label>
              <Input maxLength={4} {...register("einLast4")} placeholder="1234" />
              {errors.einLast4 && <p className="text-xs text-destructive">{errors.einLast4.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Source</Label>
            <Input {...register("source")} placeholder="Referral, website, converted lead…" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
