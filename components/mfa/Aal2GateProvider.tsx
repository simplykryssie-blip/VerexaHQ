"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Modal } from "@/components/Modal";
import { createClient } from "@/lib/supabase/client";
import { hasVerifiedMfaFactorClient, aal2RecoveryPath, isAal2RequiredError } from "@/lib/auth/aal2Client";

type Aal2GateContextValue = {
  /**
   * Call this from a fetch()'s error branch with the Response and its
   * already-parsed JSON body. Returns true (and shows the dialog) when the
   * response is the aal2_required shape every hasAal2() route now returns --
   * callers should skip their own generic error toast in that case, since
   * the dialog replaces it. Returns false for any other error, so normal
   * error handling (permission denied, validation, etc.) is unaffected.
   */
  handleAal2Response: (res: Response, json: unknown) => Promise<boolean>;
};

const Aal2GateContext = createContext<Aal2GateContextValue | null>(null);

export function useAal2Gate(): Aal2GateContextValue {
  const ctx = useContext(Aal2GateContext);
  if (!ctx) throw new Error("useAal2Gate must be used within Aal2GateProvider");
  return ctx;
}

export function Aal2GateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [checkingFactor, setCheckingFactor] = useState(false);
  const [hasFactor, setHasFactor] = useState(false);

  const handleAal2Response = useCallback(
    async (res: Response, json: unknown): Promise<boolean> => {
      if (res.status !== 403 || !isAal2RequiredError(json)) return false;
      setCheckingFactor(true);
      setOpen(true);
      try {
        const supabase = createClient();
        setHasFactor(await hasVerifiedMfaFactorClient(supabase));
      } finally {
        setCheckingFactor(false);
      }
      return true;
    },
    []
  );

  function goSetUp() {
    setOpen(false);
    router.push(aal2RecoveryPath(hasFactor, pathname || "/dashboard"));
  }

  return (
    <Aal2GateContext.Provider value={{ handleAal2Response }}>
      {children}
      {open && (
        <Modal title="Two-factor authentication required" onClose={() => setOpen(false)}>
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-sm text-slate">
              {checkingFactor
                ? "Checking your account's security setup..."
                : hasFactor
                  ? "This action requires two-factor authentication. Verify your authenticator to continue."
                  : "This action requires two-factor authentication. Set up your authenticator to continue."}
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
              Cancel
            </button>
            <button
              type="button"
              onClick={goSetUp}
              disabled={checkingFactor}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {hasFactor ? "Verify Two-Factor Authentication" : "Set Up Two-Factor Authentication"}
            </button>
          </div>
        </Modal>
      )}
    </Aal2GateContext.Provider>
  );
}
