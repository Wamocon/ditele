import { ReviewError } from "./errors";
import type { ReviewPermission, ReviewPrincipal, ReviewSubmission } from "./model";

function hasPermission(principal: ReviewPrincipal, permission: ReviewPermission): boolean {
  return principal.permissions.includes(permission);
}

function isResourceInScope(
  principal: ReviewPrincipal,
  submission: ReviewSubmission,
): boolean {
  if (principal.organizationId !== submission.organizationId) {
    return false;
  }

  if (principal.role === "admin" && hasPermission(principal, "review:read_all")) {
    return true;
  }

  return principal.assignedGroupIds.includes(submission.groupId);
}

export function assertCanReview(
  principal: ReviewPrincipal,
  submission: ReviewSubmission,
  permission: "review:read" | "review:decide" | "review:transfer",
): void {
  if (!hasPermission(principal, permission) || !isResourceInScope(principal, submission)) {
    throw new ReviewError(
      "REVIEW_FORBIDDEN",
      "The reviewer is not authorized for this submission resource.",
      { submissionId: submission.id, groupId: submission.groupId },
    );
  }
}
