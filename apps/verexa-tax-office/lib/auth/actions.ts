"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserMemberships, SELECTED_WORKSPACE_COOKIE } from "@/lib/auth/workspace";

export async function setSelectedWorkspaceAction(workspaceId: string) {
  // Never trust the caller blindly — only ever select a workspace the
  // signed-in user actually has an active membership in.
  const memberships = await getUserMemberships();
  const allowed = memberships.some((m) => m.workspace.id === workspaceId);
  if (!allowed) {
    throw new Error("You do not have access to that workspace.");
  }
  const cookieStore = await cookies();
  cookieStore.set(SELECTED_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SELECTED_WORKSPACE_COOKIE);
  redirect("/sign-in");
}

export async function portalSignOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/portal/sign-in");
}
