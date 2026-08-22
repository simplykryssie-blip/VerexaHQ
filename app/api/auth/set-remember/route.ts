import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const { remember } = (await request.json()) as { remember?: boolean };

  cookies().set("sb_remember", remember ? "persistent" : "temporary", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  });

  return NextResponse.json({ ok: true });
}
