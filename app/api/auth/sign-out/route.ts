import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  cookies().delete("sb_remember");

  const formData = await request.formData().catch(() => null);
  const isPortal = formData?.get("audience") === "portal";
  return NextResponse.redirect(new URL(isPortal ? "/portal/login" : "/login", request.url));
}
