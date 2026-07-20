import {
  AttemptDetailSchema,
  SaveAttemptDraftInputSchema,
  SubmitAttemptInputSchema,
  type AttemptDetail,
  type SaveAttemptDraftInput,
  type SubmitAttemptInput,
} from "../model/attempt";
import {
  TaskError,
  assertLearnerPrincipal,
  type TaskAccessPolicy,
  type TaskPrincipal,
} from "./task-service";

export interface AttemptRepository {
  saveDraft(input: SaveAttemptDraftInput & { learnerId: string }): Promise<unknown>;
  submit(input: SubmitAttemptInput & { learnerId: string }): Promise<unknown>;
}

async function assertAttemptAccess(
  policy: TaskAccessPolicy,
  principal: TaskPrincipal,
  input: { taskId: string; groupId: string },
  action: "draft" | "submit",
): Promise<void> {
  const allowed = await policy.canAccess({
    actorId: principal.id,
    taskId: input.taskId,
    groupId: input.groupId,
    action,
  });
  if (!allowed) {
    throw new TaskError("tasks.forbidden");
  }
}

export async function saveAttemptDraft(
  dependencies: { policy: TaskAccessPolicy; repository: AttemptRepository },
  principal: TaskPrincipal | null,
  input: unknown,
): Promise<AttemptDetail> {
  assertLearnerPrincipal(principal);
  const draft = SaveAttemptDraftInputSchema.parse(input);
  await assertAttemptAccess(dependencies.policy, principal, draft, "draft");

  return AttemptDetailSchema.parse(
    await dependencies.repository.saveDraft({ ...draft, learnerId: principal.id }),
  );
}

export async function submitAttempt(
  dependencies: { policy: TaskAccessPolicy; repository: AttemptRepository },
  principal: TaskPrincipal | null,
  input: unknown,
): Promise<AttemptDetail> {
  assertLearnerPrincipal(principal);
  const submission = SubmitAttemptInputSchema.parse(input);
  await assertAttemptAccess(dependencies.policy, principal, submission, "submit");

  return AttemptDetailSchema.parse(
    await dependencies.repository.submit({ ...submission, learnerId: principal.id }),
  );
}
