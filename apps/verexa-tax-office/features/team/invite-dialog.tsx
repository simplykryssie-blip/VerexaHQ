"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { MEMBERSHIP_ROLE_LABELS, STAFF_ROLES } from "@/lib/validation/team";
import type { Enums } from "@/types/database";

export function InviteTeamMemberDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Enums<"membership_role">>("preparer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, email: email.trim(), role }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }
    toast.success("Invite sent");
    setOpen(false);
    setEmail("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <UserPlus className="h-4 w-4" /> Invite team member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="preparer@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {MEMBERSHIP_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
