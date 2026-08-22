import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createZoomMeeting } from "@/lib/zoom/client";
import { getValidAccessToken } from "@/lib/zoom/tokens";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`zoom-create-meeting:${user.id}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { title, startAt, durationMinutes } = (await request.json()) as {
    title?: string;
    startAt?: string;
    durationMinutes?: number;
  };
  if (!title || !startAt || !durationMinutes) {
    return NextResponse.json({ error: "title, startAt, and durationMinutes are required" }, { status: 400 });
  }

  // The Zoom meeting is always created under whoever clicks the button, not
  // necessarily the staff member the appointment is assigned to -- creating
  // a meeting on someone else's behalf would need their own delegated
  // consent, which is out of scope here.
  const serviceClient = createServiceClient();
  const tokenResult = await getValidAccessToken(serviceClient, user.id);
  if (!tokenResult.ok) {
    return NextResponse.json({ configured: false, reason: tokenResult.reason }, { status: 200 });
  }

  const result = await createZoomMeeting({
    accessToken: tokenResult.accessToken,
    topic: title,
    startTimeIso: startAt,
    durationMinutes,
  });
  if (!result.ok) {
    return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
  }

  return NextResponse.json({ configured: true, joinUrl: result.data.join_url });
}
