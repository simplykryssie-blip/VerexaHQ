import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  cookies().delete("sb_remember");
  // Otherwise the next login (possibly a different person, or the same
  // person who just wants back to their own workspace) silently resumes
  // whatever workspace was last switched into via the sidebar's demo
  // switcher -- e.g. landing back in a demo workspace instead of home.
  cookies().delete(ACTIVE_WORKSPACE_COOKIE);

  const formData = await request.formData().catch(() => null);
  const isPortal = formData?.get("audience") === "portal";
  return NextResponse.redirect(new URL(isPortal ? "/portal/login" : "/login", request.url));
}
