"use client";

import { useActionState } from "react";
import { UserMinus, UserPlus } from "lucide-react";

import { Button, Card, CardDescription, CardTitle, Select } from "@/shared/ui";
import { idleState, type ActionState } from "@/features/admin/action-state";
import type { AssignedLearner, AssignedPerson } from "@/shared/data/assignment";
import {
  assignMentorAction,
  assignTrainerAction,
  enrolLearnerAction,
  removeLearnerAction,
  removeMentorAction,
  removeTrainerAction,
} from "@/app/[locale]/(admin)/admin/courses/actions";

export interface PeopleLabels {
  learnersHeading: string;
  learnersDescription: string;
  trainersHeading: string;
  trainersDescription: string;
  mentorsHeading: string;
  mentorsDescription: string;
  addLearner: string;
  addTrainer: string;
  selectPerson: string;
  add: string;
  remove: string;
  assignMentor: string;
  noLearners: string;
  noTrainers: string;
  noCandidates: string;
  noMentors: string;
}

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role="status"
      className={
        state.status === "error"
          ? "text-[13px] text-(--color-danger)"
          : "text-[13px] text-(--color-fg-muted)"
      }
    >
      {state.message}
    </p>
  );
}

/** A one-control picker plus its submit. Used for all three "add" flows. */
function AddPersonForm({
  locale,
  courseId,
  learnerId,
  action,
  candidates,
  labels,
  submitLabel,
}: {
  locale: string;
  courseId: string;
  learnerId?: string;
  action: Action;
  candidates: AssignedPerson[];
  labels: PeopleLabels;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  if (candidates.length === 0) {
    return <p className="text-[13px] text-(--color-fg-muted)">{labels.noCandidates}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="courseId" value={courseId} />
      {learnerId && <input type="hidden" name="learnerId" value={learnerId} />}
      <div className="flex flex-wrap items-end gap-2">
        <Select name="userId" aria-label={labels.selectPerson} required defaultValue="">
          <option value="" disabled>
            {labels.selectPerson}
          </option>
          {candidates.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.displayName}
            </option>
          ))}
        </Select>
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          iconLeft={<UserPlus className="size-4" aria-hidden />}
        >
          {submitLabel}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function RemoveButton({
  locale,
  courseId,
  userId,
  learnerId,
  action,
  label,
}: {
  locale: string;
  courseId: string;
  userId: string;
  learnerId?: string;
  action: Action;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="userId" value={userId} />
      {learnerId && <input type="hidden" name="learnerId" value={learnerId} />}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        iconLeft={<UserMinus className="size-4" aria-hidden />}
      >
        {label}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function LearnerPanel({
  locale,
  courseId,
  learners,
  candidates,
  trainerCandidates,
  labels,
}: {
  locale: string;
  courseId: string;
  learners: AssignedLearner[];
  candidates: AssignedPerson[];
  trainerCandidates: AssignedPerson[];
  labels: PeopleLabels;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <CardTitle>{labels.learnersHeading}</CardTitle>
        <CardDescription>{labels.learnersDescription}</CardDescription>
      </div>

      <AddPersonForm
        locale={locale}
        courseId={courseId}
        action={enrolLearnerAction}
        candidates={candidates}
        labels={labels}
        submitLabel={labels.addLearner}
      />

      {learners.length === 0 ? (
        <p className="text-[13px] text-(--color-fg-muted)">{labels.noLearners}</p>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {learners.map((learner) => (
            <li
              key={learner.userId}
              className="flex flex-col gap-2 border-t border-(--color-border) pt-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{learner.displayName}</span>
                <RemoveButton
                  locale={locale}
                  courseId={courseId}
                  userId={learner.userId}
                  action={removeLearnerAction}
                  label={labels.remove}
                />
              </div>

              {/* §1.5: a student may have many trainers, and a trainer many
                  students. The pairing is organisation-wide rather than per
                  course, which is why it is shown as a property of the person
                  and not of the enrolment. */}
              <div className="flex flex-col gap-1 pl-1">
                <span className="text-[12px] font-semibold text-(--color-fg-muted)">
                  {labels.mentorsHeading}
                </span>
                {learner.trainers.length === 0 ? (
                  <span className="text-[13px] text-(--color-fg-muted)">{labels.noMentors}</span>
                ) : (
                  <ul className="flex list-none flex-wrap gap-2 p-0">
                    {learner.trainers.map((trainer) => (
                      <li key={trainer.userId} className="flex items-center gap-1">
                        <span className="text-[13px]">{trainer.displayName}</span>
                        <RemoveButton
                          locale={locale}
                          courseId={courseId}
                          learnerId={learner.userId}
                          userId={trainer.userId}
                          action={removeMentorAction}
                          label={labels.remove}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <AddPersonForm
                  locale={locale}
                  courseId={courseId}
                  learnerId={learner.userId}
                  action={assignMentorAction}
                  candidates={trainerCandidates}
                  labels={labels}
                  submitLabel={labels.assignMentor}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TrainerPanel({
  locale,
  courseId,
  trainers,
  candidates,
  labels,
}: {
  locale: string;
  courseId: string;
  trainers: AssignedPerson[];
  candidates: AssignedPerson[];
  labels: PeopleLabels;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <CardTitle>{labels.trainersHeading}</CardTitle>
        <CardDescription>{labels.trainersDescription}</CardDescription>
      </div>

      <AddPersonForm
        locale={locale}
        courseId={courseId}
        action={assignTrainerAction}
        candidates={candidates}
        labels={labels}
        submitLabel={labels.addTrainer}
      />

      {trainers.length === 0 ? (
        <p className="text-[13px] text-(--color-fg-muted)">{labels.noTrainers}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {trainers.map((trainer) => (
            <li
              key={trainer.userId}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-(--color-border) pt-2"
            >
              <span className="font-medium">{trainer.displayName}</span>
              <RemoveButton
                locale={locale}
                courseId={courseId}
                userId={trainer.userId}
                action={removeTrainerAction}
                label={labels.remove}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
