import { z } from "zod";

export const learnerNotificationChannels = [
  "in_app",
  "email",
  "push",
] as const;
export const learnerNotificationEventFamilies = [
  "enrollment",
  "review",
  "question",
  "submission",
  "certificate",
] as const;

export const learnerNotificationChannelSchema = z.enum(
  learnerNotificationChannels,
);
export const learnerNotificationEventFamilySchema = z.enum(
  learnerNotificationEventFamilies,
);

export type LearnerNotificationChannel = z.infer<
  typeof learnerNotificationChannelSchema
>;
export type LearnerNotificationEventFamily = z.infer<
  typeof learnerNotificationEventFamilySchema
>;

const timestampSchema = z.string().min(1).transform((value, context) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    context.addIssue({ code: "custom", message: "Invalid timestamp" });
    return z.NEVER;
  }
  return timestamp.toISOString();
});

export const learnerNotificationDatabaseRowSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string().min(1).max(160),
  template_key: z.string().min(1).max(200),
  payload: z.unknown(),
  state: z.enum(["pending", "delivered", "read", "failed", "cancelled"]),
  read_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  row_version: z.number().int().positive(),
});

export const learnerPreferenceDatabaseRowSchema = z.object({
  channel: learnerNotificationChannelSchema,
  event_family: learnerNotificationEventFamilySchema,
  enabled: z.boolean(),
  row_version: z.number().int().positive(),
});

const questionPayloadSchema = z.object({
  question_id: z.string().uuid(),
});
const enrollmentAssignmentPayloadSchema = z.object({
  course_id: z.string().uuid(),
});
const enrollmentDecisionPayloadSchema = z.object({
  state: z.enum([
    "requested",
    "approved",
    "rejected",
    "assigned",
    "cancelled",
    "completed",
  ]),
});
const reviewDecisionPayloadSchema = z.object({
  decision: z.enum(["accepted", "revision_required", "transferred"]),
});
const cohortNotificationStateSchema = z.enum([
  "active",
  "completed",
  "cancelled",
]);
const cohortLifecyclePayloadSchema = z.object({
  cohort_id: z.string().uuid(),
  course_id: z.string().uuid(),
  state: cohortNotificationStateSchema,
  row_version: z.number().int().positive(),
});
const taskSchedulePayloadSchema = z.object({
  cohort_id: z.string().uuid(),
  task_id: z.string().uuid(),
  course_id: z.string().uuid().optional(),
  row_version: z.number().int().positive(),
});

const questionKinds = {
  "question.answered:notifications.question_answered": "question_answered",
  "question.transferred:notifications.question_transferred":
    "question_transferred",
  "question.claimed:notifications.question_claimed": "question_claimed",
} as const;

const cohortLifecycleKinds = {
  "cohort.started:notifications.cohort_started": {
    kind: "cohort_started",
    state: "active",
    targetCourse: true,
  },
  "cohort.completed:notifications.cohort_completed": {
    kind: "cohort_completed",
    state: "completed",
    targetCourse: false,
  },
  "cohort.cancelled:notifications.cohort_cancelled": {
    kind: "cohort_cancelled",
    state: "cancelled",
    targetCourse: false,
  },
} as const;

const taskScheduleKinds = {
  "task_schedule.created:notifications.task_schedule_created":
    "task_schedule_created",
  "task_schedule.updated:notifications.task_schedule_updated":
    "task_schedule_updated",
} as const;

export type LearnerCohortNotificationState = z.infer<
  typeof cohortNotificationStateSchema
>;

export type LearnerNotificationKind =
  | "enrollment_assigned"
  | "enrollment_decided"
  | "review_decided"
  | "question_answered"
  | "question_transferred"
  | "question_claimed"
  | "cohort_started"
  | "cohort_completed"
  | "cohort_cancelled"
  | "task_schedule_created"
  | "task_schedule_updated"
  | "unknown";

export type LearnerNotificationTarget =
  | { readonly type: "course"; readonly id: string }
  | { readonly type: "question"; readonly id: string };

export type LearnerNotificationRecord = {
  readonly id: string;
  readonly kind: LearnerNotificationKind;
  readonly readAt: string | null;
  readonly createdAt: string;
  readonly rowVersion: number;
  readonly target: LearnerNotificationTarget | null;
  readonly enrollmentState:
    | z.infer<typeof enrollmentDecisionPayloadSchema>["state"]
    | null;
  readonly reviewDecision:
    | z.infer<typeof reviewDecisionPayloadSchema>["decision"]
    | null;
  readonly cohortState: LearnerCohortNotificationState | null;
};

export type LearnerNotificationPreference = {
  readonly channel: LearnerNotificationChannel;
  readonly eventFamily: LearnerNotificationEventFamily;
  readonly enabled: boolean;
  readonly rowVersion: number;
};

export type LearnerNotificationCenter = {
  readonly items: readonly LearnerNotificationRecord[];
  readonly preferences: readonly LearnerNotificationPreference[];
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
  readonly unreadCount: number;
  readonly snapshotAt: string;
  readonly timezone: string;
};

export type LearnerNotificationActionState = {
  readonly status: "idle" | "success" | "error" | "conflict";
  readonly message: string;
};

export const learnerNotificationActionInitialState: LearnerNotificationActionState = {
  status: "idle",
  message: "",
};

export function projectLearnerNotification(
  input: unknown,
): LearnerNotificationRecord {
  const row = learnerNotificationDatabaseRowSchema.parse(input);
  const base = {
    id: row.id,
    readAt: row.read_at,
    createdAt: row.created_at,
    rowVersion: row.row_version,
    enrollmentState: null,
    reviewDecision: null,
    cohortState: null,
  } as const;

  if (
    row.event_type === "enrollment.assigned"
    && row.template_key === "notifications.enrollment_assigned"
  ) {
    const payload = enrollmentAssignmentPayloadSchema.safeParse(row.payload);
    if (payload.success) {
      return {
        ...base,
        kind: "enrollment_assigned",
        target: { type: "course", id: payload.data.course_id },
      };
    }
  }
  if (
    row.event_type === "enrollment.decided"
    && row.template_key === "notifications.enrollment_decided"
  ) {
    const payload = enrollmentDecisionPayloadSchema.safeParse(row.payload);
    if (payload.success) {
      return {
        ...base,
        kind: "enrollment_decided",
        target: null,
        enrollmentState: payload.data.state,
      };
    }
  }
  if (
    row.event_type === "review.decided"
    && row.template_key === "notifications.review_decided"
  ) {
    const payload = reviewDecisionPayloadSchema.safeParse(row.payload);
    if (payload.success) {
      return {
        ...base,
        kind: "review_decided",
        target: null,
        reviewDecision: payload.data.decision,
      };
    }
  }

  const eventTemplateKey = `${row.event_type}:${row.template_key}`;
  const questionKind =
    questionKinds[eventTemplateKey as keyof typeof questionKinds];
  if (questionKind) {
    const payload = questionPayloadSchema.safeParse(row.payload);
    if (payload.success) {
      return {
        ...base,
        kind: questionKind,
        target: { type: "question", id: payload.data.question_id },
      };
    }
  }

  const cohortLifecycleKind =
    cohortLifecycleKinds[
      eventTemplateKey as keyof typeof cohortLifecycleKinds
    ];
  if (cohortLifecycleKind) {
    const payload = cohortLifecyclePayloadSchema.safeParse(row.payload);
    if (
      payload.success &&
      payload.data.state === cohortLifecycleKind.state
    ) {
      return {
        ...base,
        kind: cohortLifecycleKind.kind,
        target: cohortLifecycleKind.targetCourse
          ? { type: "course", id: payload.data.course_id }
          : null,
        cohortState: payload.data.state,
      };
    }
  }

  const taskScheduleKind =
    taskScheduleKinds[eventTemplateKey as keyof typeof taskScheduleKinds];
  if (taskScheduleKind) {
    const payload = taskSchedulePayloadSchema.safeParse(row.payload);
    if (payload.success) {
      return {
        ...base,
        kind: taskScheduleKind,
        target: payload.data.course_id
          ? { type: "course", id: payload.data.course_id }
          : null,
      };
    }
  }

  return {
    ...base,
    kind: "unknown",
    target: null,
  };
}

export function buildLearnerNotificationPreferences(
  input: readonly unknown[],
): readonly LearnerNotificationPreference[] {
  const parsedRows = input.map((row) =>
    learnerPreferenceDatabaseRowSchema.parse(row),
  );
  const rowMap = new Map(
    parsedRows.map((row) => [`${row.event_family}:${row.channel}`, row]),
  );
  return learnerNotificationEventFamilies.flatMap((eventFamily) =>
    learnerNotificationChannels.map((channel) => {
      const row = rowMap.get(`${eventFamily}:${channel}`);
      const enabledByDefault = channel === "in_app" || channel === "email";
      return {
        channel,
        eventFamily,
        enabled: row?.enabled ?? enabledByDefault,
        rowVersion: row?.row_version ?? 0,
      };
    }),
  );
}

const markNotificationReadInputSchema = z.object({
  notificationId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.string().trim().min(16).max(200),
});
const markAllNotificationsReadInputSchema = z.object({
  before: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(16).max(200),
});
const setNotificationPreferenceInputSchema = z.object({
  eventFamily: learnerNotificationEventFamilySchema,
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  expectedInAppVersion: z.coerce.number().int().nonnegative(),
  expectedEmailVersion: z.coerce.number().int().nonnegative(),
  expectedPushVersion: z.coerce.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export function parseMarkNotificationReadForm(formData: FormData) {
  return markNotificationReadInputSchema.parse({
    notificationId: formData.get("notificationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}

export function parseMarkAllNotificationsReadForm(formData: FormData) {
  return markAllNotificationsReadInputSchema.parse({
    before: formData.get("before"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}

export function parseSetNotificationPreferenceForm(formData: FormData) {
  return setNotificationPreferenceInputSchema.parse({
    eventFamily: formData.get("eventFamily"),
    inAppEnabled: formData.get("inAppEnabled") === "on",
    emailEnabled: formData.get("emailEnabled") === "on",
    pushEnabled: formData.get("pushEnabled") === "on",
    expectedInAppVersion: formData.get("expectedInAppVersion"),
    expectedEmailVersion: formData.get("expectedEmailVersion"),
    expectedPushVersion: formData.get("expectedPushVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}
