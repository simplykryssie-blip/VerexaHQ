export type ScheduleAnchor = { assignedAt: string | null; courseCreatedAt: string };
export type ScheduledModule = { releaseDate: string | null; releaseOffsetDays: number | null };

/** Mirrors public.is_module_unlocked exactly -- the SQL function is what
 * actually gates mark_lesson_complete/submit_quiz_attempt/get_quiz_for_taking,
 * this is only the client-side echo used to decide what to render. Keep the
 * two in sync if the unlock rule ever changes. */
export function isModuleUnlocked(module: ScheduledModule, anchor: ScheduleAnchor): boolean {
  if (module.releaseDate === null && module.releaseOffsetDays === null) return true;

  const now = Date.now();

  if (module.releaseDate !== null && now >= new Date(module.releaseDate).getTime()) return true;

  if (module.releaseOffsetDays !== null) {
    const anchorDate = anchor.assignedAt ?? anchor.courseCreatedAt;
    const unlockAt = new Date(anchorDate).getTime() + module.releaseOffsetDays * 24 * 60 * 60 * 1000;
    if (now >= unlockAt) return true;
  }

  return false;
}

/** The date a still-locked module becomes available, for display ("Available <date>").
 * Returns null if the module is already unlocked or has no schedule at all. */
export function unlockDate(module: ScheduledModule, anchor: ScheduleAnchor): Date | null {
  if (isModuleUnlocked(module, anchor)) return null;

  if (module.releaseDate !== null) return new Date(module.releaseDate);

  if (module.releaseOffsetDays !== null) {
    const anchorDate = anchor.assignedAt ?? anchor.courseCreatedAt;
    return new Date(new Date(anchorDate).getTime() + module.releaseOffsetDays * 24 * 60 * 60 * 1000);
  }

  return null;
}
