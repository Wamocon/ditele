/**
 * The two independent unlock chains (see ditele_schema.md / TEST_PLAN §6).
 * Pure functions — the data modules fetch state and call these.
 *
 * ARENA chain:  arena #1 is open; arena #n opens once arena #(n-1) is ACCEPTED.
 * COURSE chain: a course task opens when
 *   (a) its attached arena task (if any) is ACCEPTED, AND
 *   (b) the previous course task's mandatory question was ANSWERED (= submitted;
 *       auto-approved, no trainer step).
 *   First task: (b) is vacuous. Trainer acceptance of a course task does NOT gate.
 */

export interface CourseTaskLite {
  id: string;
  order_index: number;
  mcq_question: string | null;
  arena_task_id: string | null;
}

export interface ArenaTaskLite {
  id: string;
  order_index: number;
}

export type CourseLockReason = "arena" | "previous_question" | null;

export interface CourseTaskUnlock {
  unlocked: boolean;
  reason: CourseLockReason;
  /** the arena task that must be accepted first, if that's the block */
  blockingArenaTaskId: string | null;
  /** the previous task whose question must be answered first, if that's the block */
  blockingPreviousTaskId: string | null;
}

export function computeCourseUnlocks(
  tasks: CourseTaskLite[],
  submittedCourseTaskIds: ReadonlySet<string>,
  acceptedArenaTaskIds: ReadonlySet<string>
): Map<string, CourseTaskUnlock> {
  const ordered = [...tasks].sort((a, b) => a.order_index - b.order_index);
  const out = new Map<string, CourseTaskUnlock>();

  for (const [i, task] of ordered.entries()) {
    const prev = i > 0 ? ordered[i - 1] ?? null : null;

    const arenaOk = !task.arena_task_id || acceptedArenaTaskIds.has(task.arena_task_id);
    const prevQuestionOk = !prev || !prev.mcq_question || submittedCourseTaskIds.has(prev.id);

    const unlocked = arenaOk && prevQuestionOk;
    let reason: CourseLockReason = null;
    if (!arenaOk) reason = "arena";
    else if (!prevQuestionOk) reason = "previous_question";

    out.set(task.id, {
      unlocked,
      reason,
      blockingArenaTaskId: !arenaOk ? task.arena_task_id : null,
      blockingPreviousTaskId: !prevQuestionOk && prev ? prev.id : null,
    });
  }
  return out;
}

export function computeArenaUnlocks(
  arenaTasks: ArenaTaskLite[],
  acceptedArenaTaskIds: ReadonlySet<string>
): Map<string, { unlocked: boolean; blockingArenaTaskId: string | null }> {
  const ordered = [...arenaTasks].sort((a, b) => a.order_index - b.order_index);
  const out = new Map<string, { unlocked: boolean; blockingArenaTaskId: string | null }>();

  for (const [i, task] of ordered.entries()) {
    const prev = i > 0 ? ordered[i - 1] ?? null : null;
    const unlocked = !prev || acceptedArenaTaskIds.has(prev.id);
    out.set(task.id, { unlocked, blockingArenaTaskId: unlocked ? null : prev ? prev.id : null });
  }
  return out;
}

/** A course is complete when every active course task is accepted. */
export function isCourseComplete(
  activeCourseTaskIds: readonly string[],
  acceptedCourseTaskIds: ReadonlySet<string>
): boolean {
  return activeCourseTaskIds.length > 0 && activeCourseTaskIds.every((id) => acceptedCourseTaskIds.has(id));
}
