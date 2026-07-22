import "server-only";

import { createServerClient } from "@/shared/database/server";
import { err, ok, mapPostgrestError, type Result } from "./result";

/**
 * Reads for the course assignment screen, and the six writes behind it.
 *
 * ⚠️ Every write here is an RPC, and that is not a style choice. The domain
 * tables refuse direct `insert`/`update` from the application and answer 42501
 * (ISSUES I-003/I-011/I-012) — `learner_trainers` does not even carry a DML
 * grant for `authenticated`. The `SECURITY DEFINER` commands in
 * `20260729100000` and its two corrections are the only write path, and each one
 * re-checks the caller's permission in the database. See
 * FEATURE_BUILD_PLAN §6.2.
 *
 * The three relationships live in three different places for reasons recorded at
 * the top of that migration:
 *
 *   learner ↔ course   `enrollments` + a cohort membership, because that is what
 *                      the learner read path demands before a course is visible
 *   trainer ↔ course   `course_trainers`, which already existed
 *   trainer ↔ learner  `learner_trainers`, which could not be expressed in
 *                      `cohort_memberships` — that table pairs a user with a
 *                      cohort, this one pairs a user with another user
 */

/** Enrolment states that mean "this learner is on the course right now". */
const LIVE_ENROLLMENT_STATES = ["requested", "approved", "assigned"] as const;

export interface AssignedPerson {
  userId: string;
  displayName: string;
  email: string | null;
}

export interface AssignedLearner extends AssignedPerson {
  enrollmentState: string;
  /** The trainers mentoring this learner, org-wide — not only on this course. */
  trainers: AssignedPerson[];
}

export interface CourseAssignments {
  learners: AssignedLearner[];
  trainers: AssignedPerson[];
  /** Everyone in the organisation who is not already on the course. */
  candidateLearners: AssignedPerson[];
  candidateTrainers: AssignedPerson[];
}

async function readDirectory(): Promise<Map<string, AssignedPerson>> {
  const supabase = await createServerClient();
  const [profiles, roles] = await Promise.all([
    supabase.from("profiles").select("user_id, display_name, state").eq("state", "active"),
    supabase
      .from("user_roles")
      .select("user_id, roles(code)")
      .is("revoked_at", null),
  ]);

  const directory = new Map<string, AssignedPerson>();
  for (const row of profiles.data ?? []) {
    directory.set(row.user_id, {
      userId: row.user_id,
      // The e-mail lives in auth.users, which needs the service role. The
      // assignment screen identifies people by display name; the users screen is
      // where addresses belong.
      email: null,
      displayName: row.display_name,
    });
  }
  void roles;
  return directory;
}

export async function getCourseAssignments(courseId: string): Promise<Result<CourseAssignments>> {
  const supabase = await createServerClient();

  const [enrollmentsRes, trainersRes, mentorsRes, rolesRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("learner_id, state")
      .eq("course_id", courseId)
      .in("state", [...LIVE_ENROLLMENT_STATES]),
    supabase
      .from("course_trainers")
      .select("trainer_id")
      .eq("course_id", courseId)
      .is("removed_at", null),
    supabase
      .from("learner_trainers")
      .select("learner_id, trainer_id")
      .is("removed_at", null),
    supabase.from("user_roles").select("user_id, roles(code)").is("revoked_at", null),
  ]);

  if (enrollmentsRes.error) return err(mapPostgrestError(enrollmentsRes.error));
  if (trainersRes.error) return err(mapPostgrestError(trainersRes.error));
  if (mentorsRes.error) return err(mapPostgrestError(mentorsRes.error));

  const directory = await readDirectory();
  const unknown = (userId: string): AssignedPerson =>
    directory.get(userId) ?? { userId, displayName: userId.slice(0, 8), email: null };

  // Which UI role each account maps onto. `toUiRole` collapses the database's
  // eight roles onto three (src/shared/auth/role.ts); here we only need to know
  // who may sensibly appear in the trainer picker.
  const trainerCodes = new Set(["trainer", "senior_trainer", "reviewer"]);
  const isTrainer = new Set<string>();
  for (const row of rolesRes.data ?? []) {
    const code = row.roles?.code;
    if (code && trainerCodes.has(code)) isTrainer.add(row.user_id);
  }

  const mentorsByLearner = new Map<string, AssignedPerson[]>();
  for (const row of mentorsRes.data ?? []) {
    const list = mentorsByLearner.get(row.learner_id) ?? [];
    list.push(unknown(row.trainer_id));
    mentorsByLearner.set(row.learner_id, list);
  }

  const learners: AssignedLearner[] = (enrollmentsRes.data ?? []).map((row) => ({
    ...unknown(row.learner_id),
    enrollmentState: row.state,
    trainers: mentorsByLearner.get(row.learner_id) ?? [],
  }));
  learners.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const trainers = (trainersRes.data ?? []).map((row) => unknown(row.trainer_id));
  trainers.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const enrolled = new Set(learners.map((row) => row.userId));
  const assigned = new Set(trainers.map((row) => row.userId));

  const everyone = [...directory.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return ok({
    learners,
    trainers,
    candidateLearners: everyone.filter((p) => !enrolled.has(p.userId) && !isTrainer.has(p.userId)),
    candidateTrainers: everyone.filter((p) => !assigned.has(p.userId) && isTrainer.has(p.userId)),
  });
}

/**
 * Enrolled-learner counts for the course cards, in one query rather than one
 * per card. §1.3 asks each card to show "how many users are on it".
 */
export async function countCourseEnrollments(
  courseIds: string[]
): Promise<Result<Map<string, number>>> {
  if (courseIds.length === 0) return ok(new Map());
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("course_id")
    .in("course_id", courseIds)
    .in("state", [...LIVE_ENROLLMENT_STATES]);
  if (error) return err(mapPostgrestError(error));

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.course_id, (counts.get(row.course_id) ?? 0) + 1);
  }
  return ok(counts);
}

export async function countCourseTrainers(
  courseIds: string[]
): Promise<Result<Map<string, number>>> {
  if (courseIds.length === 0) return ok(new Map());
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("course_trainers")
    .select("course_id")
    .in("course_id", courseIds)
    .is("removed_at", null);
  if (error) return err(mapPostgrestError(error));

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.course_id, (counts.get(row.course_id) ?? 0) + 1);
  }
  return ok(counts);
}
