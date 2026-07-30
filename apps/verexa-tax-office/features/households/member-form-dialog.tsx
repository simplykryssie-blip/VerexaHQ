"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { Loader2, Plus } from "lucide-react";

export function MemberFormDialog({ householdId, workspaceId }: { householdId: string; workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    relationship: "",
    dateOfBirth: "",
    isPrimaryTaxpayer: false,
    isSpouse: false,
    isDependent: false,
    monthsInHome: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase.from("household_members").insert({
      workspace_id: workspaceId,
      household_id: householdId,
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      relationship: form.relationship || (form.isPrimaryTaxpayer ? "self" : form.isSpouse ? "spouse" : "dependent"),
      date_of_birth: form.dateOfBirth || null,
      is_primary_taxpayer: form.isPrimaryTaxpayer,
      is_spouse: form.isSpouse,
      is_dependent: form.isDependent,
      months_in_home: form.monthsInHome ? Number(form.monthsInHome) : null,
    });
    setSubmitting(false);
    if (dbError) {
      setError(friendlyDbError(dbError.message));
      return;
    }
    toast.success("Household member added");
    setOpen(false);
    setForm({
      firstName: "",
      lastName: "",
      relationship: "",
      dateOfBirth: "",
      isPrimaryTaxpayer: false,
      isSpouse: false,
      isDependent: false,
      monthsInHome: "",
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add household member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Last name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Relationship</Label>
              <Input
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                placeholder="Self, spouse, child…"
              />
            </div>
            <div className="space-y-1">
              <Label>Date of birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Months lived in home this year</Label>
            <Input
              type="number"
              min={0}
              max={12}
              value={form.monthsInHome}
              onChange={(e) => setForm({ ...form, monthsInHome: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isPrimaryTaxpayer}
                onCheckedChange={(v) => setForm({ ...form, isPrimaryTaxpayer: v === true, isSpouse: v === true ? false : form.isSpouse })}
              />
              Primary taxpayer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isSpouse}
                onCheckedChange={(v) => setForm({ ...form, isSpouse: v === true, isPrimaryTaxpayer: v === true ? false : form.isPrimaryTaxpayer })}
              />
              Spouse
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isDependent} onCheckedChange={(v) => setForm({ ...form, isDependent: v === true })} />
              Dependent
            </label>
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
