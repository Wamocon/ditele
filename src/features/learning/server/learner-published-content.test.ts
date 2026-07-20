import { describe, expect, it } from "vitest";

import {
  LearnerCourseWorkspaceProjectionSchema,
  LearnerTaskProjectionSchema,
  toLearnerCourseWorkspace,
  toLearnerDashboard,
  toLearnerTask,
} from "./learner-published-content";

const ids = {
  enrollment: "01980a33-0000-7000-8000-000000000001",
  pendingEnrollment: "01980a33-0000-7000-8000-000000000002",
  completedEnrollment: "01980a33-0000-7000-8000-000000000003",
  course: "01980a20-0000-7000-8000-000000000001",
  pendingCourse: "01980a20-0000-7000-8000-000000000002",
  completedCourse: "01980a20-0000-7000-8000-000000000003",
  cohort: "01980a30-0000-7000-8000-000000000001",
  completedCohort: "01980a30-0000-7000-8000-000000000002",
  version: "01980a22-0000-7000-8000-000000000001",
  archivedVersion: "01980a22-0000-7000-8000-000000000002",
  stage: "01980a23-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
  optionOne: "01980a27-0000-7000-8000-000000000001",
  optionTwo: "01980a27-0000-7000-8000-000000000002",
  hint: "01980a28-0000-7000-8000-000000000001",
};

function assignedListRow(overrides: Record<string, unknown> = {}) {
  return {
    enrollment_id: ids.enrollment,
    enrollment_state: "assigned",
    course_id: ids.course,
    cohort_id: ids.cohort,
    cohort_state: "active",
    content_version_id: ids.version,
    content_version_state: "published",
    version_number: 3,
    title: "Practical testing",
    progression_mode: "scheduled",
    completed_activities: 1,
    total_activities: 2,
    next_task_id: ids.task,
    next_task_title: "Test a login flow",
    next_task_state: "revision_required",
    ...overrides,
  };
}

function courseProjection(overrides: Record<string, unknown> = {}) {
  return {
    course_id: ids.course,
    enrollment_id: ids.enrollment,
    enrollment_state: "assigned",
    cohort_id: ids.cohort,
    cohort_state: "active",
    content_version_id: ids.version,
    content_version_state: "published",
    version_number: 3,
    title: "Practical testing",
    summary: "Practice against a realistic target.",
    cohort_name: "Release 0",
    progression_mode: "scheduled",
    completed_activities: 1,
    total_activities: 2,
    stages: [{
      id: ids.stage,
      title: "Analysis",
      description: "Analyze product risks.",
      position: 0,
      activities: [{
        id: ids.task,
        title: "Test a login flow",
        description: "Create evidence.",
        position: 0,
        state: "revision_required",
        lock_reasons: [],
        expected_minutes: 45,
        available_from: "2026-07-18T08:00:00+00:00",
        due_at: null,
      }, {
        id: "01980a26-0000-7000-8000-000000000002",
        title: "Explore recovery",
        description: "Wait for activation.",
        position: 1,
        state: "locked",
        lock_reasons: [{
          code: "required_skill",
          current_basis_points: 3500,
          minimum_basis_points: 6000,
        }],
        expected_minutes: null,
        available_from: "2026-07-20T08:00:00+00:00",
        due_at: null,
      }],
    }],
    ...overrides,
  };
}

function taskProjection(overrides: Record<string, unknown> = {}) {
  const localized = {
    en: "English",
    de: "Deutsch",
    ru: "Русский",
  };
  return {
    id: ids.task,
    version_number: 3,
    content_version_id: ids.version,
    content_version_state: "published",
    course_id: ids.course,
    enrollment_id: ids.enrollment,
    cohort_id: ids.cohort,
    cohort_state: "active",
    stage_id: ids.stage,
    title: { ...localized, en: "Test a login flow" },
    instructions: { ...localized, en: "Collect evidence." },
    target_url: "https://lab.example.test/login",
    hint: { id: ids.hint, content: localized },
    assessment: {
      id: `assessment:${ids.task}`,
      question: localized,
      selection_mode: "multiple",
      options: [
        { id: ids.optionOne, label: localized },
        { id: ids.optionTwo, label: localized },
      ],
    },
    activated_at: "2026-07-18T08:00:00+00:00",
    access: "available",
    ...overrides,
  };
}

describe("learner immutable content projection", () => {
  it("maps pinned, archived-history, and unpinned pending rows without making pending actionable", () => {
    const dashboard = toLearnerDashboard([
      assignedListRow(),
      assignedListRow({
        enrollment_id: ids.pendingEnrollment,
        enrollment_state: "approved",
        course_id: ids.pendingCourse,
        cohort_id: null,
        cohort_state: null,
        content_version_id: null,
        content_version_state: null,
        version_number: null,
        title: "New request preview",
        progression_mode: null,
        completed_activities: 0,
        total_activities: 4,
        next_task_id: null,
        next_task_title: null,
        next_task_state: null,
      }),
      assignedListRow({
        enrollment_id: ids.completedEnrollment,
        enrollment_state: "completed",
        course_id: ids.completedCourse,
        cohort_id: ids.completedCohort,
        cohort_state: "completed",
        content_version_id: ids.archivedVersion,
        content_version_state: "archived",
        version_number: 1,
        title: "Pinned original title",
        completed_activities: 2,
        total_activities: 2,
        next_task_id: null,
        next_task_title: null,
        next_task_state: null,
      }),
    ], "de");

    expect(dashboard.activeCourses[0]).toMatchObject({
      groupId: ids.cohort,
      title: "Practical testing",
    });
    expect(dashboard.requestedCourses[0]).toMatchObject({
      title: "New request preview",
      state: "requested",
    });
    expect(dashboard.requestedCourses[0]).not.toHaveProperty("groupId");
    expect(dashboard.completedCourses[0]?.title).toBe("Pinned original title");
    expect(dashboard.nextAction).toMatchObject({
      activityId: ids.task,
      state: "revision_required",
      title: "Test a login flow",
      reason: "Setze mit der nächsten verfügbaren Praxisaufgabe fort.",
    });
  });

  it("fails closed on incomplete pins, cross-state pins, and partial next-task tuples", () => {
    expect(() => toLearnerDashboard([
      assignedListRow({ content_version_id: null }),
    ], "en")).toThrow("learning.pinned_course_projection_incomplete");

    expect(() => toLearnerDashboard([
      assignedListRow({
        enrollment_state: "requested",
        next_task_id: null,
        next_task_title: null,
        next_task_state: null,
      }),
    ], "en")).toThrow("learning.pending_course_must_be_unpinned");

    expect(() => toLearnerDashboard([
      assignedListRow({ next_task_title: null }),
    ], "en")).toThrow("learning.next_task_projection_incomplete");
  });

  it("maps an assigned workspace and an archived completed workspace to explicit access modes", () => {
    const active = toLearnerCourseWorkspace(courseProjection());
    const history = toLearnerCourseWorkspace(courseProjection({
      enrollment_state: "completed",
      cohort_id: ids.completedCohort,
      cohort_state: "completed",
      content_version_id: ids.archivedVersion,
      content_version_state: "archived",
      completed_activities: 2,
    }));

    expect(active.accessMode).toBe("active");
    expect(active.stages[0]?.activities[0]).toMatchObject({
      state: "revision_required",
      lockReasons: [],
      expectedMinutes: 45,
    });
    expect(active.stages[0]?.activities[1]).toMatchObject({
      state: "locked",
      lockReasons: [{
        code: "required_skill",
        current_basis_points: 3500,
        minimum_basis_points: 6000,
      }],
    });
    expect(history.accessMode).toBe("history");
  });

  it("rejects malformed course totals, draft versions, and hidden snapshot fields", () => {
    expect(() => LearnerCourseWorkspaceProjectionSchema.parse(
      courseProjection({ total_activities: 99 }),
    )).toThrow("learning.activity_total_mismatch");
    expect(() => LearnerCourseWorkspaceProjectionSchema.parse(
      courseProjection({ content_version_state: "draft" }),
    )).toThrow();
    expect(() => LearnerCourseWorkspaceProjectionSchema.parse({
      ...courseProjection(),
      object_key: "private/course-object",
    })).toThrow();
    expect(() => toLearnerCourseWorkspace(courseProjection({
      stages: [{
        ...courseProjection().stages[0],
        activities: [{
          ...courseProjection().stages[0]!.activities[1],
          lock_reasons: [],
        }, courseProjection().stages[0]!.activities[0]],
      }],
    }))).toThrow("learning.locked_activity_requires_reason");
    expect(() => toLearnerCourseWorkspace(courseProjection({
      stages: [{
        ...courseProjection().stages[0],
        activities: [{
          ...courseProjection().stages[0]!.activities[0],
          lock_reasons: [{ code: "required_task" }],
        }, courseProjection().stages[0]!.activities[1]],
      }],
    }))).toThrow("learning.open_activity_cannot_have_lock_reason");
  });

  it("maps only safe localized task fields and retains the immutable version number", () => {
    const { task, enrollmentId } = toLearnerTask(taskProjection());

    expect(enrollmentId).toBe(ids.enrollment);
    expect(task).toMatchObject({
      id: ids.task,
      version: 3,
      groupId: ids.cohort,
      access: "available",
      targetUrl: "https://lab.example.test/login",
    });
    expect(task.title).toEqual({
      en: "Test a login flow",
      de: "Deutsch",
      ru: "Русский",
    });
    expect(task.assessment?.options).toHaveLength(2);
  });

  it("rejects answer leakage, storage keys, incomplete locales, and non-active task cohorts", () => {
    expect(() => LearnerTaskProjectionSchema.parse({
      ...taskProjection(),
      model_answer: "hidden",
    })).toThrow();
    expect(() => LearnerTaskProjectionSchema.parse({
      ...taskProjection(),
      object_key: "private/task-video",
    })).toThrow();
    expect(() => LearnerTaskProjectionSchema.parse({
      ...taskProjection(),
      assessment: {
        ...taskProjection().assessment,
        options: [{
          id: ids.optionOne,
          label: { en: "One", de: "Eins", ru: "Один" },
          is_correct: true,
        }, {
          id: ids.optionTwo,
          label: { en: "Two", de: "Zwei", ru: "Два" },
        }],
      },
    })).toThrow();
    expect(() => LearnerTaskProjectionSchema.parse({
      ...taskProjection(),
      title: { en: "English", de: "Deutsch" },
    })).toThrow();
    expect(() => LearnerTaskProjectionSchema.parse({
      ...taskProjection(),
      cohort_state: "completed",
    })).toThrow();
  });
});
