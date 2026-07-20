import {
  ArchiveQuestionInputSchema,
  CreateQuestionInputSchema,
  QuestionThreadSchema,
  type ArchiveQuestionInput,
  type CreateQuestionInput,
  type QuestionThread,
} from "../model/question";

export interface MentoringPrincipal {
  id: string;
  role: "guest" | "learner" | "trainer" | "admin" | "organization_admin";
}

export interface QuestionAccessPolicy {
  canAccess(input: {
    actorId: string;
    taskId?: string;
    groupId?: string;
    questionId?: string;
    action: "create" | "read" | "archive";
  }): Promise<boolean>;
}

export interface QuestionRepository {
  create(input: CreateQuestionInput & { learnerId: string }): Promise<unknown>;
  get(input: { questionId: string; learnerId: string }): Promise<unknown>;
  archive(input: ArchiveQuestionInput & { learnerId: string }): Promise<unknown>;
}

export class QuestionError extends Error {
  constructor(
    readonly code:
      | "questions.authentication_required"
      | "questions.forbidden"
      | "questions.stale_version",
  ) {
    super(code);
    this.name = "QuestionError";
  }
}

function assertLearner(
  principal: MentoringPrincipal | null,
): asserts principal is MentoringPrincipal {
  if (!principal) {
    throw new QuestionError("questions.authentication_required");
  }
  if (principal.role !== "learner") {
    throw new QuestionError("questions.forbidden");
  }
}

export async function createQuestion(
  dependencies: { policy: QuestionAccessPolicy; repository: QuestionRepository },
  principal: MentoringPrincipal | null,
  input: unknown,
): Promise<QuestionThread> {
  assertLearner(principal);
  const command = CreateQuestionInputSchema.parse(input);
  const allowed = await dependencies.policy.canAccess({
    actorId: principal.id,
    taskId: command.taskId,
    groupId: command.groupId,
    action: "create",
  });
  if (!allowed) throw new QuestionError("questions.forbidden");

  return QuestionThreadSchema.parse(
    await dependencies.repository.create({ ...command, learnerId: principal.id }),
  );
}

export async function getQuestionThread(
  dependencies: { policy: QuestionAccessPolicy; repository: QuestionRepository },
  principal: MentoringPrincipal | null,
  questionId: string,
): Promise<QuestionThread> {
  assertLearner(principal);
  const allowed = await dependencies.policy.canAccess({
    actorId: principal.id,
    questionId,
    action: "read",
  });
  if (!allowed) throw new QuestionError("questions.forbidden");

  return QuestionThreadSchema.parse(
    await dependencies.repository.get({ questionId, learnerId: principal.id }),
  );
}

export async function archiveQuestion(
  dependencies: { policy: QuestionAccessPolicy; repository: QuestionRepository },
  principal: MentoringPrincipal | null,
  input: unknown,
): Promise<QuestionThread> {
  assertLearner(principal);
  const command = ArchiveQuestionInputSchema.parse(input);
  const allowed = await dependencies.policy.canAccess({
    actorId: principal.id,
    questionId: command.questionId,
    action: "archive",
  });
  if (!allowed) throw new QuestionError("questions.forbidden");

  return QuestionThreadSchema.parse(
    await dependencies.repository.archive({ ...command, learnerId: principal.id }),
  );
}
