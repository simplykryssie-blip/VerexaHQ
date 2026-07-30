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
import { leadSchema, LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadInput } from "@/lib/validation/leads";
import { toast } from "@/components/ui/toaster";
import type { Tables } from "@/types/database";
import { Loader2, Plus } from "lucide-react";

type Lead = Tables<"leads">;

export function LeadFormDialog({
  workspaceId,
  lead,
  trigger,
}: {
  workspaceId: string;
  lead?: Lead;
  trigger?: React.ReactNode;
}) {
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
  } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      firstName: lead?.first_name ?? "",
      lastName: lead?.last_name ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      company: lead?.company ?? "",
      source: lead?.source ?? "",
      serviceInterest: lead?.service_interest ?? "",
      status: lead?.status ?? "new",
      notes: lead?.notes ?? "",
      consultationAt: lead?.consultation_at ? lead.consultation_at.slice(0, 16) : "",
    },
  });

  async function onSubmit(values: LeadInput) {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      workspace_id: workspaceId,
      first_name: values.firstName,
      last_name: values.lastName,
      email: values.email || null,
      phone: values.phone || null,
      company: values.company || null,
      source: values.source || null,
      service_interest: values.serviceInterest || null,
      status: values.status,
      notes: values.notes || null,
      consultation_at: values.consultationAt ? new Date(values.consultationAt).toISOString() : null,
    };

    const { error: dbError } = lead
      ? await supabase.from("leads").update(payload).eq("id", lead.id)
      : await supabase.from("leads").insert(payload);

    setSubmitting(false);
    if (dbError) {
      setError(friendlyDbError(dbError.message));
      return;
    }
    toast.success(lead ? "Lead updated" : "Lead added");
    setOpen(false);
    reset();
    router.refresh();
  }

  const status = watch("status");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="brand">
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "Add lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First name</Label>
              <Input {...register("firstName")} aria-invalid={!!errors.firstName} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Last name</Label>
              <Input {...register("lastName")} aria-invalid={!!errors.lastName} />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input type="tel" {...register("phone")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Company</Label>
              <Input {...register("company")} />
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Input {...register("source")} placeholder="Referral, website, ad…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Services of interest</Label>
            <Input {...register("serviceInterest")} placeholder="Individual tax preparation" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as LeadInput["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Follow-up / consultation</Label>
              <Input type="datetime-local" {...register("consultationAt")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={3} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {lead ? "Save changes" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
