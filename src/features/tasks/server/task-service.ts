import { LearnerTaskSchema, type LearnerTask } from "../model/task";

export interface TaskPrincipal {
  id: string;
  role: "guest" | "learner" | "trainer" | "admin" | "organization_admin";
}

export interface TaskAccessPolicy {
  canAccess(input: {
    actorId: string;
    taskId: string;
    groupId: string;
    action: "read" | "draft" | "submit";
  }): Promise<boolean>;
}

export interface LearnerTaskRepository {
  get(input: { actorId: string; taskId: string; groupId: string }): Promise<unknown>;
}

export class TaskError extends Error {
  constructor(
    readonly code:
      | "tasks.authentication_required"
      | "tasks.forbidden"
      | "tasks.inactive"
      | "tasks.stale_version"
      | "tasks.duplicate_submission",
  ) {
    super(code);
    this.name = "TaskError";
  }
}

export function assertLearnerPrincipal(
  principal: TaskPrincipal | null,
): asserts principal is TaskPrincipal {
  if (!principal) {
    throw new TaskError("tasks.authentication_required");
  }
  if (principal.role !== "learner") {
    throw new TaskError("tasks.forbidden");
  }
}

export async function getLearnerTask(
  dependencies: { policy: TaskAccessPolicy; repository: LearnerTaskRepository },
  principal: TaskPrincipal | null,
  input: { taskId: string; groupId: string },
): Promise<LearnerTask> {
  assertLearnerPrincipal(principal);
  const allowed = await dependencies.policy.canAccess({
    actorId: principal.id,
    taskId: input.taskId,
    groupId: input.groupId,
    action: "read",
  });
  if (!allowed) {
    throw new TaskError("tasks.forbidden");
  }

  const task = LearnerTaskSchema.parse(
    await dependencies.repository.get({ ...input, actorId: principal.id }),
  );
  if (task.access !== "available") {
    throw new TaskError("tasks.inactive");
  }

  return task;
}
