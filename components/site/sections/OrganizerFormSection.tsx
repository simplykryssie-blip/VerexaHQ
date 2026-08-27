"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PublicOrganizerForm } from "@/components/organizer/PublicOrganizerForm";

type OrganizerFormConfig = {
  public_token?: string;
};

// A thin embed of the existing standalone public organizer flow (/o/[token],
// PublicOrganizerForm.tsx) inside a site page section -- reused as-is rather
// than rebuilt, since it already handles the full intake + optional portal
// account creation in one atomic submission. That page fetches its data
// server-side (it owns the whole route); a section embedded inside a
// larger page's client-rendered SectionRenderer has to fetch it itself on
// mount instead.
export function OrganizerFormSection({ config }: { config: OrganizerFormConfig }) {
  const supabase = createClient();
  const [data, setData] = useState<unknown>(undefined);
  const [notFound, setNotFound] = useState(false);
  const token = config.public_token;

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      return;
    }
    supabase.rpc("get_public_organizer_template", { p_token: token }).then(({ data: result }) => {
      if (!result) {
        setNotFound(true);
        return;
      }
      setData(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This form isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been turned off, or the link is incorrect.</p>
      </div>
    );
  }

  if (!data || !token) return null;

  return <PublicOrganizerForm token={token} data={data as never} />;
}
