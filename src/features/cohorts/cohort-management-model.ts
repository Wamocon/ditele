import { z } from "zod";

import type { Locale } from "@/shared/i18n/config";

const localeSchema = z.enum(["en", "de", "ru"]);
const timestampSchema = z.string().datetime({ offset: true });

export const cohortManagementCohortRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  course_id: z.string().uuid(),
  content_version_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1),
  state: z.enum(["waiting", "active", "completed", "cancelled"]),
  progression_mode: z.enum(["scheduled", "flexible"]),
  starts_at: timestampSchema.nullable(),
  ends_at: timestampSchema.nullable(),
  capacity: z.number().int().positive().nullable(),
  row_version: z.number().int().positive(),
  updated_at: timestampSchema,
  completed_at: timestampSchema.nullable(),
});

export const cohortManagementCourseRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1),
  default_locale: localeSchema,
});

export const cohortManagementCourseLocalizationRowsSchema = z.array(
  z.object({
    course_id: z.string().uuid(),
    locale: localeSchema,
    title: z.string().trim().min(1),
  }),
);

export const cohortManagementContentVersionRowSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  state: z.enum(["published", "archived"]),
});

export const cohortManagementTaskRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    course_id: z.string().uuid(),
    stage_id: z.string().uuid(),
    content_version_id: z.string().uuid().nullable(),
    position: z.number().int().nonnegative(),
    task_kind: z.enum(["practical", "knowledge", "placement"]),
    state: z.literal("active"),
  }),
);

export const cohortManagementStageRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    position: z.number().int().nonnegative(),
  }),
);

export const cohortManagementStageLocalizationRowsSchema = z.array(
  z.object({
    stage_id: z.string().uuid(),
    locale: localeSchema,
    title: z.string().trim().min(1),
  }),
);

export const cohortManagementTaskLocalizationRowsSchema = z.array(
  z.object({
    task_id: z.string().uuid(),
    locale: localeSchema,
    title: z.string().trim().min(1),
  }),
);

export const cohortManagementScheduleRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    cohort_id: z.string().uuid(),
    task_id: z.string().uuid(),
    available_from: timestampSchema.nullable(),
    due_at: timestampSchema.nullable(),
    change_reason: z.string().trim().min(1),
    row_version: z.number().int().positive(),
    updated_at: timestampSchema,
  }),
);

export const cohortManagementMembershipRowsSchema = z.array(
  z.object({
    user_id: z.string().uuid(),
    role: z.enum(["learner", "trainer"]),
    state: z.enum(["invited", "active", "suspended", "removed"]),
  }),
);

type CohortRow = z.infer<typeof cohortManagementCohortRowSchema>;
type TaskRow = z.infer<typeof cohortManagementTaskRowsSchema>[number];
type StageRow = z.infer<typeof cohortManagementStageRowsSchema>[number];
type StageLocalizationRow = z.infer<
  typeof cohortManagementStageLocalizationRowsSchema
>[number];
type TaskLocalizationRow = z.infer<
  typeof cohortManagementTaskLocalizationRowsSchema
>[number];
type ScheduleRow = z.infer<typeof cohortManagementScheduleRowsSchema>[number];
type MembershipRow = z.infer<
  typeof cohortManagementMembershipRowsSchema
>[number];

export type CohortManagementPerspective = "admin" | "trainer";

export interface CohortScheduleItem {
  readonly id: string | null;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskTitleLocale: Locale | null;
  readonly taskTitleUsesFallback: boolean;
  readonly taskKind: TaskRow["task_kind"];
  readonly stageTitle: string;
  readonly stageTitleLocale: Locale | null;
  readonly stageTitleUsesFallback: boolean;
  readonly availableFrom: string | null;
  readonly dueAt: string | null;
  readonly changeReason: string | null;
  readonly updatedAt: string | null;
  readonly rowVersion: number;
}

export interface CohortManagementDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly courseId: string;
  readonly contentVersionId: string | null;
  readonly courseTitle: string;
  readonly courseTitleLocale: Locale | null;
  readonly courseTitleUsesFallback: boolean;
  readonly publishedVersionNumber: number | null;
  readonly pinnedVersionState: "published" | "archived" | null;
  readonly name: string;
  readonly state: CohortRow["state"];
  readonly progressionMode: CohortRow["progression_mode"];
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly completedAt: string | null;
  readonly capacity: number | null;
  readonly rowVersion: number;
  readonly updatedAt: string;
  readonly learnerCount: number;
  readonly trainerCount: number;
  readonly schedules: readonly CohortScheduleItem[];
  readonly canStart: boolean;
  readonly canComplete: boolean;
  readonly canCancel: boolean;
  readonly canManageSchedules: boolean;
}

type LocalizedText = {
  readonly value: string;
  readonly locale: Locale | null;
  readonly usesFallback: boolean;
};

function resolveLocalizedText(
  rows: readonly { readonly locale: Locale; readonly title: string }[],
  requestedLocale: Locale,
  defaultLocale: Locale,
  fallback: string,
): LocalizedText {
  const selected =
    rows.find((row) => row.locale === requestedLocale) ??
    rows.find((row) => row.locale === defaultLocale) ??
    rows.find((row) => row.locale === "en") ??
    rows[0];
  return {
    value: selected?.title ?? fallback,
    locale: selected?.locale ?? null,
    usesFallback: selected?.locale !== requestedLocale,
  };
}

function projectSchedule(
  task: TaskRow,
  stage: StageRow,
  schedule: ScheduleRow | undefined,
  taskLocalizations: readonly TaskLocalizationRow[],
  stageLocalizations: readonly StageLocalizationRow[],
  locale: Locale,
  defaultLocale: Locale,
): CohortScheduleItem {
  const taskTitle = resolveLocalizedText(
    taskLocalizations.filter((row) => row.task_id === task.id),
    locale,
    defaultLocale,
    task.id,
  );
  const stageTitle = resolveLocalizedText(
    stageLocalizations.filter((row) => row.stage_id === stage.id),
    locale,
    defaultLocale,
    stage.id,
  );
  return {
    id: schedule?.id ?? null,
    taskId: task.id,
    taskTitle: taskTitle.value,
    taskTitleLocale: taskTitle.locale,
    taskTitleUsesFallback: taskTitle.usesFallback,
    taskKind: task.task_kind,
    stageTitle: stageTitle.value,
    stageTitleLocale: stageTitle.locale,
    stageTitleUsesFallback: stageTitle.usesFallback,
    availableFrom: schedule?.available_from ?? null,
    dueAt: schedule?.due_at ?? null,
    changeReason: schedule?.change_reason ?? null,
    updatedAt: schedule?.updated_at ?? null,
    rowVersion: schedule?.row_version ?? 0,
  };
}

export function projectCohortManagementDetail({
  canManage,
  canOperateAsTrainer,
  cohortInput,
  courseInput,
  courseLocalizationsInput,
  locale,
  membershipsInput,
  publishedVersionId,
  publishedVersionNumber,
  pinnedVersionState,
  schedulesInput,
  stageLocalizationsInput,
  stagesInput,
  taskLocalizationsInput,
  tasksInput,
}: {
  readonly canManage: boolean;
  readonly canOperateAsTrainer: boolean;
  readonly cohortInput: unknown;
  readonly courseInput: unknown;
  readonly courseLocalizationsInput: unknown;
  readonly locale: Locale;
  readonly membershipsInput: unknown;
  readonly publishedVersionId: string | null;
  readonly publishedVersionNumber: number | null;
  readonly pinnedVersionState: "published" | "archived" | null;
  readonly schedulesInput: unknown;
  readonly stageLocalizationsInput: unknown;
  readonly stagesInput: unknown;
  readonly taskLocalizationsInput: unknown;
  readonly tasksInput: unknown;
}): CohortManagementDetail {
  const cohort = cohortManagementCohortRowSchema.parse(cohortInput);
  const course = cohortManagementCourseRowSchema.parse(courseInput);
  const courseLocalizations =
    cohortManagementCourseLocalizationRowsSchema.parse(courseLocalizationsInput);
  const memberships =
    cohortManagementMembershipRowsSchema.parse(membershipsInput);
  const schedules = cohortManagementScheduleRowsSchema.parse(schedulesInput);
  const stages = cohortManagementStageRowsSchema.parse(stagesInput);
  const stageLocalizations =
    cohortManagementStageLocalizationRowsSchema.parse(stageLocalizationsInput);
  const tasks = cohortManagementTaskRowsSchema.parse(tasksInput);
  const taskLocalizations =
    cohortManagementTaskLocalizationRowsSchema.parse(taskLocalizationsInput);

  if (cohort.course_id !== course.id) {
    throw new Error("cohort_management.course_scope_mismatch");
  }
  if (
    publishedVersionId !== null &&
    cohort.content_version_id !== publishedVersionId
  ) {
    throw new Error("cohort_management.content_version_scope_mismatch");
  }
  const pinnedTaskIds = new Set(tasks.map((task) => task.id));
  if (
    tasks.some(
      (task) =>
        task.course_id !== cohort.course_id ||
        task.content_version_id !== cohort.content_version_id,
    ) ||
    schedules.some(
      (schedule) =>
        schedule.cohort_id !== cohort.id ||
        !pinnedTaskIds.has(schedule.task_id),
    )
  ) {
    throw new Error("cohort_management.child_scope_mismatch");
  }

  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const scheduleByTaskId = new Map(
    schedules.map((schedule) => [schedule.task_id, schedule]),
  );
  const scheduleItems = tasks
    .map((task) => {
      const stage = stageById.get(task.stage_id);
      if (!stage) throw new Error("cohort_management.task_stage_missing");
      return {
        item: projectSchedule(
          task,
          stage,
          scheduleByTaskId.get(task.id),
          taskLocalizations,
          stageLocalizations,
          locale,
          course.default_locale,
        ),
        stagePosition: stage.position,
        taskPosition: task.position,
      };
    })
    .toSorted(
      (left, right) =>
        left.stagePosition - right.stagePosition ||
        left.taskPosition - right.taskPosition ||
        left.item.taskId.localeCompare(right.item.taskId),
    )
    .map(({ item }) => item);
  const courseTitle = resolveLocalizedText(
    courseLocalizations.filter((row) => row.course_id === course.id),
    locale,
    course.default_locale,
    course.slug,
  );
  const activeMemberships = memberships.filter(
    (membership) => membership.state === "active",
  );
  const canOperate = canManage || canOperateAsTrainer;
  const lifecycleOpen = cohort.state === "waiting" || cohort.state === "active";
  const hasPublishedPin =
    cohort.content_version_id !== null &&
    publishedVersionNumber !== null &&
    pinnedVersionState === "published";
  const hasReadablePin =
    cohort.content_version_id !== null &&
    publishedVersionNumber !== null &&
    pinnedVersionState !== null;

  return {
    id: cohort.id,
    organizationId: cohort.organization_id,
    courseId: cohort.course_id,
    contentVersionId: cohort.content_version_id,
    courseTitle: courseTitle.value,
    courseTitleLocale: courseTitle.locale,
    courseTitleUsesFallback: courseTitle.usesFallback,
    publishedVersionNumber,
    pinnedVersionState,
    name: cohort.name,
    state: cohort.state,
    progressionMode: cohort.progression_mode,
    startsAt: cohort.starts_at,
    endsAt: cohort.ends_at,
    completedAt: cohort.completed_at,
    capacity: cohort.capacity,
    rowVersion: cohort.row_version,
    updatedAt: cohort.updated_at,
    learnerCount: activeMemberships.filter(
      (membership) => membership.role === "learner",
    ).length,
    trainerCount: activeMemberships.filter(
      (membership) => membership.role === "trainer",
    ).length,
    schedules: scheduleItems,
    canStart: canOperate && cohort.state === "waiting" && hasPublishedPin,
    canComplete: canOperate && cohort.state === "active",
    canCancel: canManage && lifecycleOpen,
    canManageSchedules:
      canOperate &&
      ((cohort.state === "waiting" && hasPublishedPin) ||
        (cohort.state === "active" && hasReadablePin)),
  };
}

export function activeTrainerMembership(
  membershipsInput: unknown,
  userId: string,
): boolean {
  return cohortManagementMembershipRowsSchema
    .parse(membershipsInput)
    .some(
      (membership: MembershipRow) =>
        membership.user_id === userId &&
        membership.role === "trainer" &&
        membership.state === "active",
    );
}
