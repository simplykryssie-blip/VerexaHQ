"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

// Self-serve workspace creation is closed -- every workspace is either
// provisioned by a platform admin or created by accepting an ERO/Service
// Bureau connection invite (app/join). An authenticated user with no
// workspace membership lands here with nothing they can do about it
// themselves; this used to be a "create your firm" form, but that only
// worked by accident (a grant regression briefly reopened it) and was
// never meant to be reachable.
export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (portalUser) {
        router.replace("/portal/dashboard");
        return;
      }
      setChecked(true);
    });
  }, [supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!checked) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">No workspace yet</h1>
        <p className="mt-2 text-sm text-muted">
          Your account isn&apos;t connected to a workspace yet. If you were expecting an invitation, check your email for it, or reach
          out to whoever set up your account.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-6 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink transition hover:bg-surfaceMuted"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
