"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EarlyAccessCampaign } from "@/lib/earlyAccess/types";

type Membership = {
  loading: boolean;
  inProgram: boolean;
  campaign: EarlyAccessCampaign | null;
};

// A workspace is "in" Early Access once it has an accepted agreement for a
// campaign -- there's no separate membership/enrollment table, so this is
// the real signal to gate on rather than showing EA UI to every workspace.
export function useEarlyAccessMembership(workspaceId: string | null): Membership {
  const [state, setState] = useState<Membership>({ loading: true, inProgram: false, campaign: null });

  useEffect(() => {
    if (!workspaceId) {
      setState({ loading: false, inProgram: false, campaign: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: agreement } = await supabase
        .from("early_access_agreements")
        .select("campaign_id")
        .eq("workspace_id", workspaceId)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!agreement) {
        setState({ loading: false, inProgram: false, campaign: null });
        return;
      }

      const { data: campaign } = await supabase
        .from("early_access_campaigns")
        .select("*")
        .eq("id", agreement.campaign_id)
        .maybeSingle();

      if (cancelled) return;
      setState({
        loading: false,
        inProgram: true,
        campaign: (campaign as EarlyAccessCampaign) ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return state;
}
