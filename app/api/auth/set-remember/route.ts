import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

export async function POST(request: Request) {
  const { remember } = (await request.json()) as { remember?: boolean };

  cookies().set("sb_remember", remember ? "persistent" : "temporary", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  });

  // Runs on every successful login. active_workspace_id (set by the sidebar's
  // demo-workspace switcher) outlives a single session -- it's a 30-day
  // cookie, not tied to the Supabase auth session -- so without this, a
  // fresh login after switching into a demo workspace and closing the
  // browser (rather than clicking Sign out) silently resumes that demo
  // workspace instead of landing back home. Same reasoning /api/auth/sign-out
  // already applies on the way out; this covers the way back in.
  cookies().delete(ACTIVE_WORKSPACE_COOKIE);

  return NextResponse.json({ ok: true });
}
