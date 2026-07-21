import "server-only";

import { createServerClient } from "@/shared/database/server";
import { createServiceRoleClient } from "@/shared/database/service-role";
import { ok, err, fromSupabase, mapPostgrestError, type Result } from "./result";

/**
 * WS-6 — Admin Ops data layer.
 *
 * Three rules this deployment forces on you (measured, see plan/status/WS-6.md):
 *
 *  1. **The service-role key cannot touch a table** (ISSUES I-002). It works for
 *     the Auth Admin API and nothing else. Every table read and write here uses
 *     the *admin's own authenticated session*.
 *  2. **`cohorts` and `cohort_memberships` have no insert path** (I-011, I-012).
 *     Creating a cohort or assigning a trainer is impossible until a migration
 *     lands. The functions below say so instead of failing at runtime.
 *  3. **Never call a decision RPC on an already-decided row** (I-007) — it hangs
 *     and poisons PostgREST for every other chat for ~30s. `decideEnrollment`
 *     re-reads and guards the state before it calls.
 *
 * Every list takes `limit` + `offset` (02_WORKSTREAMS §5.5 rule 2).
 */

/* ── Shared shapes ──────────────────────────────────────────────────────── */

export interface Page<T> {
  rows: T[];
  /** Total matching rows before limit/offset, so Pagination can be honest. */
  total: number;
}

export interface ListArgs {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 25;
/** How many rows we merge in memory before paginating. See mergedPage(). */
const MERGE_CEILING = 1000;

function slice<T>(rows: T[], { limit = DEFAULT_LIMIT, offset = 0 }: ListArgs): Page<T> {
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

/* ── Users ──────────────────────────────────────────────────────────────── */

export interface AdminUser {
  userId: string;
  displayName: string;
  /** Only the Auth Admin API knows this — `profiles` has no email column. */
  email: string | null;
  roleCode: string | null;
  /** The live `user_roles` row, so a role change can UPDATE it. */
  roleRowId: string | null;
  profileState: string;
  locale: string;
  timezone: string;
  lastSignInAt: string | null;
  /** Non-null ⇒ the account is deactivated (an Auth ban). */
  bannedUntil: string | null;
  emailConfirmedAt: string | null;
  createdAt: string;
  rowVersion: number;
}

export interface RoleOption {
  id: string;
  code: string;
}

/** The `roles` table, ordered by code. Never hardcode a role id. */
export async function listRoles(): Promise<Result<RoleOption[]>> {
  const supabase = await createServerClient();
  return fromSupabase(async () => {
    const { data, error } = await supabase.from("roles").select("id, code").order("code");
    return { data, error };
  });
}

/**
 * Emails and sign-in timestamps live in `auth.users`, names and locales live in
 * `profiles`, and the role lives in `user_roles`. Three sources, merged here so
 * no screen ever does it twice.
 *
 * The merge is in memory: filtering by email cannot be pushed down to the
 * `profiles` query, so a server-side `.range()` would produce wrong page counts.
 * Bounded at MERGE_CEILING rows — well beyond the ~200 users this launches with,
 * and the bound is visible in `truncated` rather than silent.
 */
export async function listAdminUsers(
  args: ListArgs & { search?: string; roleCode?: string } = {}
): Promise<Result<Page<AdminUser> & { truncated: boolean }>> {
  const supabase = await createServerClient();

  const [profilesRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, locale, timezone, state, row_version, created_at")
      .order("display_name")
      .limit(MERGE_CEILING),
    supabase
      .from("user_roles")
      .select("id, user_id, role_id, revoked_at, roles(code)")
      .is("revoked_at", null)
      .limit(MERGE_CEILING),
  ]);

  if (profilesRes.error) return err(mapPostgrestError(profilesRes.error));
  if (rolesRes.error) return err(mapPostgrestError(rolesRes.error));

  const authUsers = await listAuthUsers();

  const roleByUser = new Map<string, { rowId: string; code: string | null }>();
  for (const row of rolesRes.data ?? []) {
    // A user may hold several rows; the first live one drives the badge.
    if (!roleByUser.has(row.user_id)) {
      roleByUser.set(row.user_id, { rowId: row.id, code: row.roles?.code ?? null });
    }
  }

  const merged: AdminUser[] = (profilesRes.data ?? []).map((p) => {
    const role = roleByUser.get(p.user_id);
    const auth = authUsers.get(p.user_id);
    return {
      userId: p.user_id,
      displayName: p.display_name,
      email: auth?.email ?? null,
      roleCode: role?.code ?? null,
      roleRowId: role?.rowId ?? null,
      profileState: p.state,
      locale: p.locale,
      timezone: p.timezone,
      lastSignInAt: auth?.lastSignInAt ?? null,
      bannedUntil: auth?.bannedUntil ?? null,
      emailConfirmedAt: auth?.emailConfirmedAt ?? null,
      createdAt: p.created_at,
      rowVersion: p.row_version,
    };
  });

  const needle = args.search?.trim().toLowerCase();
  const filtered = merged.filter((u) => {
    if (args.roleCode && u.roleCode !== args.roleCode) return false;
    if (!needle) return true;
    return (
      u.displayName.toLowerCase().includes(needle) ||
      (u.email ?? "").toLowerCase().includes(needle)
    );
  });

  return ok({
    ...slice(filtered, args),
    truncated: (profilesRes.data ?? []).length >= MERGE_CEILING,
  });
}

interface AuthUserFacts {
  email: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  emailConfirmedAt: string | null;
}

/**
 * The Auth Admin API is the ONE thing the service-role key can still do here.
 * Never called from a Client Component — this module is `server-only`.
 * Degrades to an empty map rather than failing the whole screen: a user list
 * without emails is worth more than an error page.
 */
async function listAuthUsers(): Promise<Map<string, AuthUserFacts>> {
  const facts = new Map<string, AuthUserFacts>();
  try {
    const admin = createServiceRoleClient();
    const perPage = 200;
    for (let page = 1; page <= Math.ceil(MERGE_CEILING / perPage); page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error || !data) break;
      for (const u of data.users) {
        const banned = (u as { banned_until?: string | null }).banned_until ?? null;
        facts.set(u.id, {
          email: u.email ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
          bannedUntil: banned,
          emailConfirmedAt: u.email_confirmed_at ?? null,
        });
      }
      if (data.users.length < perPage) break;
    }
  } catch {
    // Auth API unreachable — the caller still gets names, roles and states.
  }
  return facts;
}

export interface AdminUserDetail {
  user: AdminUser;
  enrollments: EnrollmentApplication[];
  cohorts: { cohortId: string; cohortName: string; role: string; state: string }[];
}

export async function getAdminUser(userId: string): Promise<Result<AdminUserDetail>> {
  const supabase = await createServerClient();

  const [usersRes, membershipRes, enrollmentsRes] = await Promise.all([
    listAdminUsers({ limit: MERGE_CEILING }),
    supabase
      .from("cohort_memberships")
      .select("cohort_id, role, state, cohorts(name)")
      .eq("user_id", userId),
    listEnrollmentApplications({ learnerId: userId, limit: MERGE_CEILING }),
  ]);

  if (!usersRes.ok) return usersRes;
  const user = usersRes.data.rows.find((u) => u.userId === userId);
  if (!user) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  if (membershipRes.error) return err(mapPostgrestError(membershipRes.error));

  return ok({
    user,
    enrollments: enrollmentsRes.ok ? enrollmentsRes.data.rows : [],
    cohorts: (membershipRes.data ?? []).map((m) => ({
      cohortId: m.cohort_id,
      cohortName: m.cohorts?.name ?? m.cohort_id,
      role: m.role,
      state: m.state,
    })),
  });
}

/* ── User mutations ─────────────────────────────────────────────────────── */

/**
 * Creating the auth user is enough: a trigger writes the `profiles` row (taking
 * the name from `user_metadata.display_name`) AND a default `user_roles` row.
 * So the role is applied by UPDATING that row — inserting a second live role
 * hits the `user_roles_live_scope_uidx` unique index (23505).
 */
export async function createAdminUser(args: {
  email: string;
  password: string;
  displayName: string;
  roleId: string;
}): Promise<Result<{ userId: string }>> {
  let userId: string;
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: args.email,
      password: args.password,
      email_confirm: true,
      user_metadata: { display_name: args.displayName },
    });
    if (error || !data.user) {
      return err({
        code: "AUTH",
        message: error?.message.includes("already")
          ? "Für diese E-Mail-Adresse existiert bereits ein Konto."
          : "Das Konto konnte nicht angelegt werden.",
        retryable: false,
      });
    }
    userId = data.user.id;
  } catch {
    return err({ code: "NETWORK", message: "Verbindung zum Server fehlgeschlagen.", retryable: true });
  }

  const roleResult = await setUserRole({ userId, roleId: args.roleId });
  if (!roleResult.ok) {
    // The account exists but has the default role. Say so — do not pretend.
    return err({
      code: "PARTIAL",
      message:
        "Das Konto wurde angelegt, die Rolle konnte aber nicht gesetzt werden. Bitte im Benutzerdetail nachtragen.",
      retryable: false,
    });
  }
  return ok({ userId });
}

/** Updates the live `user_roles` row in place. One live role per user and org. */
export async function setUserRole(args: { userId: string; roleId: string }): Promise<Result<null>> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ role_id: args.roleId, reason: "Rollenänderung durch Administration" })
    .eq("user_id", args.userId)
    .is("revoked_at", null);
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/** Deactivate = an Auth ban. `profiles.state` is not writable by an admin. */
export async function setUserActive(args: { userId: string; active: boolean }): Promise<Result<null>> {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(args.userId, {
      ban_duration: args.active ? "none" : "876000h",
    });
    if (error) {
      return err({ code: "AUTH", message: "Der Status konnte nicht geändert werden.", retryable: true });
    }
    return ok(null);
  } catch {
    return err({ code: "NETWORK", message: "Verbindung zum Server fehlgeschlagen.", retryable: true });
  }
}

export async function resetUserPassword(args: {
  userId: string;
  password: string;
}): Promise<Result<null>> {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(args.userId, { password: args.password });
    if (error) {
      return err({
        code: "AUTH",
        message: "Das Passwort konnte nicht gesetzt werden. Es muss der Passwortrichtlinie entsprechen.",
        retryable: false,
      });
    }
    return ok(null);
  } catch {
    return err({ code: "NETWORK", message: "Verbindung zum Server fehlgeschlagen.", retryable: true });
  }
}

/* ── Enrolment applications ─────────────────────────────────────────────── */

/**
 * The `enrollment_state` enum, from RPC_CONTRACTS.md §1. A filter arrives as a
 * URL search param, so it is narrowed here rather than passed through as a
 * string — an unknown value becomes "no filter", never a failed query.
 */
export const ENROLLMENT_STATES = [
  "requested",
  "approved",
  "rejected",
  "assigned",
  "cancelled",
  "completed",
] as const;
export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];

export function parseEnrollmentState(value: string | undefined): EnrollmentState | undefined {
  return ENROLLMENT_STATES.find((s) => s === value);
}

export interface EnrollmentApplication {
  id: string;
  learnerId: string;
  learnerName: string;
  courseId: string;
  courseTitle: string;
  cohortId: string | null;
  cohortName: string | null;
  state: string;
  requestNote: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  rowVersion: number;
}

export async function listEnrollmentApplications(
  args: ListArgs & { state?: EnrollmentState; learnerId?: string } = {}
): Promise<Result<Page<EnrollmentApplication>>> {
  const supabase = await createServerClient();

  let query = supabase
    .from("enrollments")
    .select(
      "id, learner_id, course_id, cohort_id, state, request_note, decision_reason, created_at, decided_at, row_version"
    )
    .order("created_at", { ascending: false })
    .limit(MERGE_CEILING);
  if (args.state) query = query.eq("state", args.state);
  if (args.learnerId) query = query.eq("learner_id", args.learnerId);

  const [enrollmentsRes, names, courses, cohorts] = await Promise.all([
    query,
    displayNames(),
    courseTitles(),
    cohortNames(),
  ]);
  if (enrollmentsRes.error) return err(mapPostgrestError(enrollmentsRes.error));

  const rows: EnrollmentApplication[] = (enrollmentsRes.data ?? []).map((e) => ({
    id: e.id,
    learnerId: e.learner_id,
    learnerName: names.get(e.learner_id) ?? e.learner_id,
    courseId: e.course_id,
    courseTitle: courses.get(e.course_id) ?? e.course_id,
    cohortId: e.cohort_id,
    cohortName: e.cohort_id ? (cohorts.get(e.cohort_id) ?? e.cohort_id) : null,
    state: e.state,
    requestNote: e.request_note,
    decisionReason: e.decision_reason,
    createdAt: e.created_at,
    decidedAt: e.decided_at,
    rowVersion: e.row_version,
  }));

  return ok(slice(rows, args));
}

/**
 * ⚠️ I-007: a decision RPC on an already-decided row HANGS and takes PostgREST
 * down for every other chat for ~30s. Re-read the state here, immediately before
 * the call, and refuse rather than risk it. The UI hides the button too — this
 * is the second of the two guards, because a stale page can still submit.
 */
export async function decideEnrollment(args: {
  enrollmentId: string;
  decision: "approved" | "rejected";
  reason: string;
}): Promise<Result<null>> {
  const supabase = await createServerClient();

  const { data: current, error: readError } = await supabase
    .from("enrollments")
    .select("state, row_version")
    .eq("id", args.enrollmentId)
    .maybeSingle();
  if (readError) return err(mapPostgrestError(readError));
  if (!current) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  if (current.state !== "requested") {
    return err({
      code: "ALREADY_DECIDED",
      message: "Diese Anfrage wurde bereits entschieden. Bitte laden Sie die Seite neu.",
      retryable: false,
    });
  }

  const { error } = await supabase.rpc("decide_enrollment", {
    p_enrollment_id: args.enrollmentId,
    p_decision: args.decision,
    p_reason: args.reason,
    p_expected_version: current.row_version,
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/** Only an `approved` enrolment can be assigned. Same hang guard as above. */
export async function assignEnrollment(args: {
  enrollmentId: string;
  cohortId: string;
  reason: string;
}): Promise<Result<null>> {
  const supabase = await createServerClient();

  const { data: current, error: readError } = await supabase
    .from("enrollments")
    .select("state, row_version")
    .eq("id", args.enrollmentId)
    .maybeSingle();
  if (readError) return err(mapPostgrestError(readError));
  if (!current) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  if (current.state !== "approved") {
    return err({
      code: "NOT_ASSIGNABLE",
      message: "Nur genehmigte Anfragen können einer Gruppe zugeteilt werden.",
      retryable: false,
    });
  }

  const { error } = await supabase.rpc("assign_enrollment", {
    p_enrollment_id: args.enrollmentId,
    p_cohort_id: args.cohortId,
    p_reason: args.reason,
    p_expected_version: current.row_version,
    p_correlation_id: crypto.randomUUID(),
  });
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/* ── Cohorts (groups) ───────────────────────────────────────────────────── */

export const COHORT_STATES = ["waiting", "active", "completed", "cancelled"] as const;
export type CohortState = (typeof COHORT_STATES)[number];

export function parseCohortState(value: string | undefined): CohortState | undefined {
  return COHORT_STATES.find((s) => s === value);
}

export interface AdminCohort {
  id: string;
  name: string;
  state: string;
  courseId: string;
  courseTitle: string;
  progressionMode: string;
  capacity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  learnerCount: number;
  trainerCount: number;
  rowVersion: number;
}

export async function listCohorts(
  args: ListArgs & { state?: CohortState } = {}
): Promise<Result<Page<AdminCohort>>> {
  const supabase = await createServerClient();

  let query = supabase
    .from("cohorts")
    .select(
      "id, name, state, course_id, progression_mode, capacity, starts_at, ends_at, completed_at, row_version"
    )
    .order("created_at", { ascending: false })
    .limit(MERGE_CEILING);
  if (args.state) query = query.eq("state", args.state);

  const [cohortsRes, membershipsRes, courses] = await Promise.all([
    query,
    supabase.from("cohort_memberships").select("cohort_id, role, state").limit(MERGE_CEILING),
    courseTitles(),
  ]);
  if (cohortsRes.error) return err(mapPostgrestError(cohortsRes.error));
  if (membershipsRes.error) return err(mapPostgrestError(membershipsRes.error));

  const counts = new Map<string, { learners: number; trainers: number }>();
  for (const m of membershipsRes.data ?? []) {
    if (m.state === "removed") continue;
    const entry = counts.get(m.cohort_id) ?? { learners: 0, trainers: 0 };
    if (m.role === "trainer") entry.trainers += 1;
    else entry.learners += 1;
    counts.set(m.cohort_id, entry);
  }

  const rows: AdminCohort[] = (cohortsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    state: c.state,
    courseId: c.course_id,
    courseTitle: courses.get(c.course_id) ?? c.course_id,
    progressionMode: c.progression_mode,
    capacity: c.capacity,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    completedAt: c.completed_at,
    learnerCount: counts.get(c.id)?.learners ?? 0,
    trainerCount: counts.get(c.id)?.trainers ?? 0,
    rowVersion: c.row_version,
  }));

  return ok(slice(rows, args));
}

export interface CohortMember {
  userId: string;
  displayName: string;
  role: string;
  state: string;
  assignedAt: string;
}

export async function getCohort(
  cohortId: string
): Promise<Result<{ cohort: AdminCohort; members: CohortMember[] }>> {
  const supabase = await createServerClient();

  const [listRes, membersRes, names] = await Promise.all([
    listCohorts({ limit: MERGE_CEILING }),
    supabase
      .from("cohort_memberships")
      .select("user_id, role, state, assigned_at")
      .eq("cohort_id", cohortId)
      .order("assigned_at"),
    displayNames(),
  ]);

  if (!listRes.ok) return listRes;
  const cohort = listRes.data.rows.find((c) => c.id === cohortId);
  if (!cohort) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  if (membersRes.error) return err(mapPostgrestError(membersRes.error));

  return ok({
    cohort,
    members: (membersRes.data ?? []).map((m) => ({
      userId: m.user_id,
      displayName: names.get(m.user_id) ?? m.user_id,
      role: m.role,
      state: m.state,
      assignedAt: m.assigned_at,
    })),
  });
}

/** Which transitions the UI offers. The database is still the authority. */
export const COHORT_TRANSITIONS: Record<string, CohortState[]> = {
  waiting: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function transitionCohortState(args: {
  cohortId: string;
  targetState: CohortState;
  reason: string;
}): Promise<Result<null>> {
  const supabase = await createServerClient();

  const { data: current, error: readError } = await supabase
    .from("cohorts")
    .select("state, row_version")
    .eq("id", args.cohortId)
    .maybeSingle();
  if (readError) return err(mapPostgrestError(readError));
  if (!current) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });

  const allowed = COHORT_TRANSITIONS[current.state] ?? [];
  if (!allowed.includes(args.targetState)) {
    return err({
      code: "INVALID_TRANSITION",
      message: "Dieser Statuswechsel ist nicht möglich. Bitte laden Sie die Seite neu.",
      retryable: false,
    });
  }

  const { error } = await supabase.rpc("transition_cohort", {
    p_cohort_id: args.cohortId,
    p_target_state: args.targetState,
    p_reason: args.reason,
    p_expected_version: current.row_version,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: `cohort:${args.cohortId}:${current.row_version}:${args.targetState}`,
  });
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/** `cohorts` UPDATE is granted even though INSERT is not (I-011). */
export async function updateCohortSchedule(args: {
  cohortId: string;
  name: string;
  capacity: number | null;
  startsAt: string | null;
  endsAt: string | null;
}): Promise<Result<null>> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("cohorts")
    .update({
      name: args.name,
      capacity: args.capacity,
      starts_at: args.startsAt,
      ends_at: args.endsAt,
    })
    .eq("id", args.cohortId);
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/* ── Support issues ─────────────────────────────────────────────────────── */

export interface SupportIssue {
  id: string;
  title: string;
  description: string;
  severity: string;
  state: string;
  reporterId: string | null;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  rowVersion: number;
}

export async function listSupportIssues(
  args: ListArgs & { state?: string; severity?: string } = {}
): Promise<Result<Page<SupportIssue>>> {
  const supabase = await createServerClient();

  let query = supabase
    .from("support_issues")
    .select(
      "id, title, description_redacted, severity, state, reporter_id, assignee_id, created_at, resolved_at, row_version"
    )
    .order("created_at", { ascending: false })
    .limit(MERGE_CEILING);
  if (args.state) query = query.eq("state", args.state);
  if (args.severity) query = query.eq("severity", args.severity);

  const [issuesRes, names] = await Promise.all([query, displayNames()]);
  if (issuesRes.error) return err(mapPostgrestError(issuesRes.error));

  const rows: SupportIssue[] = (issuesRes.data ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description_redacted,
    severity: i.severity,
    state: i.state,
    reporterId: i.reporter_id,
    reporterName: i.reporter_id ? (names.get(i.reporter_id) ?? null) : null,
    assigneeId: i.assignee_id,
    assigneeName: i.assignee_id ? (names.get(i.assignee_id) ?? null) : null,
    createdAt: i.created_at,
    resolvedAt: i.resolved_at,
    rowVersion: i.row_version,
  }));

  return ok(slice(rows, args));
}

/** UPDATE is granted on `support_issues`; INSERT is not (nothing creates one). */
export async function updateSupportIssueState(args: {
  issueId: string;
  state: string;
}): Promise<Result<null>> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("support_issues")
    .update({
      state: args.state,
      ...(args.state === "resolved" ? { resolved_at: new Date().toISOString() } : {}),
    })
    .eq("id", args.issueId);
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/* ── Ratings ────────────────────────────────────────────────────────────── */

export interface RatingComment {
  id: string;
  score: number;
  comment: string | null;
  learnerName: string;
  subject: string;
  createdAt: string;
}

export interface RatingAggregate {
  key: string;
  kind: "course" | "task";
  subject: string;
  count: number;
  average: number;
  /** Index 0 = one star … index 4 = five stars. */
  distribution: [number, number, number, number, number];
}

export async function listRatings(
  args: ListArgs = {}
): Promise<Result<{ aggregates: RatingAggregate[]; comments: Page<RatingComment> }>> {
  const supabase = await createServerClient();

  const [ratingsRes, names, courses, tasks] = await Promise.all([
    supabase
      .from("ratings")
      .select("id, course_id, task_id, learner_id, score, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(MERGE_CEILING),
    displayNames(),
    courseTitles(),
    taskTitles(),
  ]);
  if (ratingsRes.error) return err(mapPostgrestError(ratingsRes.error));

  const buckets = new Map<string, RatingAggregate>();
  const comments: RatingComment[] = [];

  for (const r of ratingsRes.data ?? []) {
    const kind: "course" | "task" = r.course_id ? "course" : "task";
    const id = r.course_id ?? r.task_id;
    if (!id) continue;
    const subject =
      kind === "course" ? (courses.get(id) ?? id) : (tasks.get(id) ?? id);
    const key = `${kind}:${id}`;

    const bucket =
      buckets.get(key) ??
      { key, kind, subject, count: 0, average: 0, distribution: [0, 0, 0, 0, 0] as RatingAggregate["distribution"] };
    bucket.count += 1;
    // average holds the running sum here; divided once below.
    bucket.average += r.score;
    const index = Math.min(4, Math.max(0, r.score - 1));
    bucket.distribution[index] = (bucket.distribution[index] ?? 0) + 1;
    buckets.set(key, bucket);

    if (r.comment && r.comment.trim().length > 0) {
      comments.push({
        id: r.id,
        score: r.score,
        comment: r.comment,
        learnerName: names.get(r.learner_id) ?? r.learner_id,
        subject,
        createdAt: r.created_at,
      });
    }
  }

  const aggregates = [...buckets.values()]
    .map((b) => ({ ...b, average: b.count > 0 ? b.average / b.count : 0 }))
    // Worst-rated first — that is the row an admin needs to act on.
    .sort((a, b) => a.average - b.average || b.count - a.count);

  return ok({ aggregates, comments: slice(comments, args) });
}

/* ── Own profile (admin) ────────────────────────────────────────────────── */

export interface OwnProfile {
  userId: string;
  displayName: string;
  locale: string;
  timezone: string;
  email: string | null;
  roleCode: string | null;
  rowVersion: number;
}

export async function getOwnProfile(userId: string): Promise<Result<OwnProfile>> {
  const supabase = await createServerClient();

  const [profileRes, roleRes, authRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, locale, timezone, row_version")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .limit(1),
    supabase.auth.getUser(),
  ]);

  if (profileRes.error) return err(mapPostgrestError(profileRes.error));
  if (!profileRes.data) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });

  return ok({
    userId: profileRes.data.user_id,
    displayName: profileRes.data.display_name,
    locale: profileRes.data.locale,
    timezone: profileRes.data.timezone,
    email: authRes.data.user?.email ?? null,
    roleCode: roleRes.data?.[0]?.roles?.code ?? null,
    rowVersion: profileRes.data.row_version,
  });
}

/**
 * `profiles` is not directly writable even by an admin — `update_own_profile`
 * is a SECURITY DEFINER RPC and the only write path, own row only.
 */
export async function updateOwnAdminProfile(args: {
  displayName: string;
  locale: string;
  timezone: string;
  expectedVersion: number;
}): Promise<Result<null>> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_own_profile", {
    p_display_name: args.displayName,
    p_locale: args.locale,
    p_timezone: args.timezone,
    p_expected_version: args.expectedVersion,
    p_correlation_id: crypto.randomUUID(),
    p_idempotency_key: `profile:${args.expectedVersion}:${args.displayName}`,
  });
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/* ── Platform settings (read-only reference) ────────────────────────────── */

export interface PlatformInfo {
  organizationName: string;
  organizationSlug: string;
  organizationState: string;
  courseCount: number;
  cohortCount: number;
  userCount: number;
}

export async function getPlatformInfo(): Promise<Result<PlatformInfo>> {
  const supabase = await createServerClient();

  const [orgRes, coursesRes, cohortsRes, profilesRes] = await Promise.all([
    supabase.from("organizations").select("name, slug, state").limit(1).maybeSingle(),
    // { count: "exact", head: true } silently fails on this PostgREST build
    // (WS-0.md) — always take a row with the count.
    supabase.from("courses").select("id", { count: "exact" }).limit(1),
    supabase.from("cohorts").select("id", { count: "exact" }).limit(1),
    supabase.from("profiles").select("user_id", { count: "exact" }).limit(1),
  ]);

  if (orgRes.error) return err(mapPostgrestError(orgRes.error));

  return ok({
    organizationName: orgRes.data?.name ?? "—",
    organizationSlug: orgRes.data?.slug ?? "—",
    organizationState: orgRes.data?.state ?? "—",
    courseCount: coursesRes.count ?? 0,
    cohortCount: cohortsRes.count ?? 0,
    userCount: profilesRes.count ?? 0,
  });
}

/* ── Lookup helpers ─────────────────────────────────────────────────────── */

/** user_id → display name. One query, reused by every screen that shows a person. */
async function displayNames(): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("profiles").select("user_id, display_name").limit(MERGE_CEILING);
  return new Map((data ?? []).map((p) => [p.user_id, p.display_name]));
}

/**
 * course_id → title. Titles live in `course_localizations`, not `courses`.
 * German first, then the course's own default locale, then anything.
 */
async function courseTitles(): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("course_localizations")
    .select("course_id, locale, title")
    .limit(MERGE_CEILING);

  const byCourse = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.locale === "de" || !byCourse.has(row.course_id)) byCourse.set(row.course_id, row.title);
  }
  return byCourse;
}

/** task_id → title. `tasks` is admin-readable; the title column is `slug`-free. */
async function taskTitles(): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("task_localizations").select("task_id, locale, title").limit(MERGE_CEILING);

  const byTask = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.locale === "de" || !byTask.has(row.task_id)) byTask.set(row.task_id, row.title);
  }
  return byTask;
}

async function cohortNames(): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("cohorts").select("id, name").limit(MERGE_CEILING);
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}
