"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { friendlyAuthError } from "@/lib/errors";
import { Loader2 } from "lucide-react";

export default function PortalResetPasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  async function onSubmit(values: ResetPasswordInput) {
    setLoading(true);
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    setLoading(false);
    if (error) {
      setServerError(friendlyAuthError(error.message));
      return;
    }
    router.push("/portal/sign-in?reset=success");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a password</CardTitle>
        <CardDescription>Your password must be at least 8 characters. This also completes your portal invite, if you were just invited.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" variant="brand" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Set password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
