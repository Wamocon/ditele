import "server-only";

import { z } from "zod";

import type {
  EnrollmentApplication,
  SupportIssue,
} from "@/features/administration/model";
import { createServerClient } from "@/shared/database/server";

const EnrollmentStateSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "assigned",
  "cancelled",
  "completed",
]);

function applicationState(value: string): EnrollmentApplication["state"] {
  const state = EnrollmentStateSchema.parse(value);
  if (state === "requested") return "pending";
  if (state === "rejected" || state === "cancelled") return "rejected";
  return "accepted";
}

function issueState(value: string): SupportIssue["state"] {
  return ["open", "in_progress", "resolved", "closed"].includes(value)
    ? (value as SupportIssue["state"])
    : "open";
}

export async function readAdministrationOperations() {
  const client = await createServerClient();
  const [enrollments, issues] = await Promise.all([
    client
      .from("enrollments")
      .select("id, organization_id, learner_id, course_id, state, row_version")
      .order("updated_at", { ascending: false })
      .limit(50),
    client
      .from("support_issues")
      .select("id, organization_id, state, row_version")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  if (enrollments.error || issues.error) {
    throw new Error("administration.operations_read_failed", {
      cause: enrollments.error ?? issues.error,
    });
  }

  return {
    applications: enrollments.data.map((item) => ({
      id: item.id,
      organizationId: item.organization_id,
      learnerId: item.learner_id,
      courseId: item.course_id,
      state: applicationState(item.state),
      version: item.row_version,
    })) satisfies EnrollmentApplication[],
    issues: issues.data.flatMap((item) =>
      item.organization_id
        ? [{
            id: item.id,
            organizationId: item.organization_id,
            state: issueState(item.state),
            version: item.row_version,
          }]
        : [],
    ) satisfies SupportIssue[],
    exports: [],
  };
}
