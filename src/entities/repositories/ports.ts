import type { Principal } from "@/shared/auth/types";
import type {
  ArchiveQuestionInput,
  AuditEventInput,
  CreateQuestionInput,
  Enrollment,
  NotificationInput,
  RequestEnrollmentInput,
  SaveAttemptDraftInput,
  SubmitAttemptInput,
} from "@/shared/api/contracts";

export interface MutationEffects {
  audit: AuditEventInput;
  notification?: NotificationInput;
}

export interface AuthorizedCommand<TInput> {
  principal: Principal;
  input: TInput;
  effects: MutationEffects;
}

export interface EnrollmentRepository {
  request(command: AuthorizedCommand<RequestEnrollmentInput>): Promise<Enrollment>;
}

export interface LearningRepository {
  saveDraft(command: AuthorizedCommand<SaveAttemptDraftInput>): Promise<{ version: number }>;
  submit(command: AuthorizedCommand<SubmitAttemptInput>): Promise<{ submissionId: string; version: number }>;
}

export interface QuestionRepository {
  create(command: AuthorizedCommand<CreateQuestionInput>): Promise<{ questionId: string; version: number }>;
  archive(command: AuthorizedCommand<ArchiveQuestionInput>): Promise<{ questionId: string; version: number }>;
}

