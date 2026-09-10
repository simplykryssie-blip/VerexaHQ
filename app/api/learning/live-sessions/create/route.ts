import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createZoomMeeting, createZoomWebinar } from "@/lib/zoom/client";
import { getValidAccessToken } from "@/lib/zoom/tokens";
import { checkRateLimit } from "@/lib/rateLimit";

// Creates a live-session module in one shot: the learning_modules row, the
// Zoom meeting/webinar under the calling staff member's connected Zoom
// account, and the learning_live_sessions row tying them together.
// Not wrapped in a DB transaction -- the Zoom call can't participate in
// one -- so on a failure after the module insert we best-effort roll it
// back rather than leave an orphaned module with no session behind it.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`learning-live-session-create:${user.id}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { courseId, title, scheduledStart, durationMinutes, isWebinar, displayOrder } = (await request.json()) as {
    courseId?: string;
    title?: string;
    scheduledStart?: string;
    durationMinutes?: number;
    isWebinar?: boolean;
    displayOrder?: number;
  };
  if (!courseId || !title?.trim() || !scheduledStart || !durationMinutes) {
    return NextResponse.json({ error: "courseId, title, scheduledStart, and durationMinutes are required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const tokenResult = await getValidAccessToken(serviceClient, user.id);
  if (!tokenResult.ok) {
    return NextResponse.json({ configured: false, reason: tokenResult.reason }, { status: 200 });
  }

  let usedWebinar = Boolean(isWebinar);
  let zoomResult = usedWebinar
    ? await createZoomWebinar({ accessToken: tokenResult.accessToken, topic: title.trim(), startTimeIso: scheduledStart, durationMinutes })
    : await createZoomMeeting({ accessToken: tokenResult.accessToken, topic: title.trim(), startTimeIso: scheduledStart, durationMinutes });

  let fallbackNotice: string | null = null;
  if (!zoomResult.ok && usedWebinar) {
    // Webinars need a separate paid Zoom add-on -- an account without it
    // errors here. Fall back to a regular meeting instead of failing outright.
    usedWebinar = false;
    fallbackNotice = "This Zoom account doesn't have Webinars -- scheduled as a regular meeting instead.";
    zoomResult = await createZoomMeeting({ accessToken: tokenResult.accessToken, topic: title.trim(), startTimeIso: scheduledStart, durationMinutes });
  }
  if (!zoomResult.ok) {
    return NextResponse.json({ configured: false, reason: zoomResult.reason }, { status: 200 });
  }

  const { data: moduleRow, error: moduleError } = await supabase
    .from("learning_modules")
    .insert({ course_id: courseId, module_type: "live_session", title: title.trim(), display_order: displayOrder ?? 0 })
    .select("id")
    .single();
  if (moduleError || !moduleRow) {
    return NextResponse.json({ error: moduleError?.message ?? "Could not create module" }, { status: 400 });
  }

  const { error: sessionError } = await supabase.from("learning_live_sessions").insert({
    module_id: moduleRow.id,
    host_user_id: user.id,
    zoom_meeting_id: String(zoomResult.data.id),
    join_url: zoomResult.data.join_url,
    start_url: zoomResult.data.start_url,
    scheduled_start: scheduledStart,
    duration_minutes: durationMinutes,
    is_webinar: usedWebinar,
  });
  if (sessionError) {
    await supabase.from("learning_modules").delete().eq("id", moduleRow.id);
    return NextResponse.json({ error: sessionError.message }, { status: 400 });
  }

  return NextResponse.json({ configured: true, moduleId: moduleRow.id, joinUrl: zoomResult.data.join_url, fallbackNotice });
}
