"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { friendlyAuthError } from "@/lib/errors";
import { Loader2 } from "lucide-react";

export default function PortalSignInPage() {
  return (
    <Suspense fallback={null}>
      <PortalSignInForm />
    </Suspense>
  );
}

function PortalSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  async function onSubmit(values: SignInInput) {
    setLoading(true);
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    setLoading(false);
    if (error) {
      setServerError(friendlyAuthError(error.message));
      return;
    }
    const next = searchParams.get("next") || "/portal";
    router.push(next);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client portal sign in</CardTitle>
        <CardDescription>Access your documents, organizer, invoices, and messages.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/portal/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" variant="brand" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Don&apos;t have portal access yet? Ask your tax office to send you an invite.
        </p>
      </CardContent>
    </Card>
  );
}
