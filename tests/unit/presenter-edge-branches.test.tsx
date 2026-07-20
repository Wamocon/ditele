import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AiCoachPanel } from "@/features/ai/components/ai-coach-panel";
import { EntitlementGate } from "@/features/entitlements/components/entitlement-gate";
import { LabStatusPanel } from "@/features/labs/components/lab-status-panel";
import type { LabSession } from "@/features/labs/model";
import { SkillPathOverview } from "@/features/skills/components/skill-path-overview";
import type { MasterySnapshot, Skill } from "@/features/skills/model";

afterEach(cleanup);

const timestamp = "2026-07-18T08:00:00.000Z";

describe("AI coach presenter edge states", () => {
  const labels = {
    title: "AI coach",
    idleDescription: "Ask a conceptual question when you need guidance.",
    refused: "Request refused",
    unavailable: "Coach unavailable",
    citations: "Approved sources",
  };

  it("separates idle, provider-unavailable, and approved contextual answers", () => {
    const { rerender } = render(<AiCoachPanel labels={labels} outcome={null} />);
    expect(screen.getByRole("heading", { name: "AI coach" })).toBeInTheDocument();
    expect(screen.getByText("Ask a conceptual question when you need guidance.")).toBeInTheDocument();

    rerender(<AiCoachPanel labels={labels} outcome={{ status: "unavailable", reason: "provider_timeout" }} />);
    expect(screen.getByRole("heading", { name: "Coach unavailable" })).toBeInTheDocument();
    expect(screen.getByText("provider_timeout")).toBeInTheDocument();

    rerender(
      <AiCoachPanel
        labels={labels}
        outcome={{
          status: "answered",
          message: "Start by identifying the valid and invalid equivalence partitions.",
          hintLevel: 1,
          citations: [{ id: "context-1", title: "Approved syllabus", sourceUrl: null }],
        }}
      />,
    );
    expect(screen.getByText(/identifying the valid and invalid/)).toBeInTheDocument();
    expect(screen.getByText("Approved sources: 1")).toHaveClass("badge");
  });
});

describe("lab presenter lifecycle tones", () => {
  const labels = {
    title: "Testing lab",
    unavailableTitle: "Lab unavailable",
    unavailable: {
      not_configured: "No provider is configured.",
      temporarily_unavailable: "The provider is temporarily unavailable.",
      capacity_exhausted: "All isolated environments are busy.",
    },
    states: {
      requested: "Requested",
      provisioning: "Provisioning",
      ready: "Ready",
      active: "Active",
      validating: "Validating",
      reset_pending: "Reset pending",
      destroy_pending: "Destroy pending",
      destroyed: "Destroyed",
      failed: "Failed",
      expired: "Expired",
    },
  } as const;
  const session: LabSession = {
    id: "session-1",
    scenarioId: "scenario-1",
    scenarioVersion: 1,
    scenarioSnapshot: {
      scenarioId: "scenario-1",
      scenarioVersion: 1,
      providerKind: "docker",
      provisioningConfig: { template: "presenter-fixture" },
      retentionMinutes: 60,
      ruleSetFingerprint: `sha256:${"a".repeat(64)}`,
      validationRules: [{ id: "rule-1", passingScore: 1, evidenceRequired: false }],
    },
    learnerId: "learner-1",
    organizationId: "org-1",
    providerReference: null,
    activeLease: null,
    state: "requested",
    version: 1,
    requestedAt: timestamp,
    expiresAt: null,
    failureCode: null,
  };

  it("shows no stale state without a session and maps ready, failed, and transitional tones", () => {
    const { rerender } = render(<LabStatusPanel availability={{ available: true }} labels={labels} />);
    expect(screen.getByRole("heading", { name: "Testing lab" })).toBeInTheDocument();
    expect(document.querySelector(".badge")).not.toBeInTheDocument();

    rerender(<LabStatusPanel availability={{ available: true }} labels={labels} session={{ ...session, state: "ready" }} />);
    expect(screen.getByText("Ready")).toHaveClass("badge--success");

    rerender(<LabStatusPanel availability={{ available: true }} labels={labels} session={{ ...session, state: "failed" }} />);
    expect(screen.getByText("Failed")).toHaveClass("badge--danger");

    rerender(<LabStatusPanel availability={{ available: true }} labels={labels} session={session} />);
    expect(screen.getByText("Requested")).toHaveClass("badge");
    expect(screen.getByText("Requested")).not.toHaveClass("badge--success", "badge--danger");
  });
});

describe("skill path recommendation branches", () => {
  const skills: Skill[] = [
    { id: "skill-1", code: "BOUNDARY", title: "Boundary analysis", prerequisiteSkillIds: [], targetScore: 0.8, estimatedMinutes: 45 },
    { id: "skill-2", code: "API", title: "API evidence", prerequisiteSkillIds: ["skill-1"], targetScore: 0.8, estimatedMinutes: 60 },
  ];
  const mastery: MasterySnapshot[] = [
    { learnerId: "learner-1", skillId: "skill-1", score: 1, level: "mastered", verifiedEvidenceCount: 3, calculatedAt: timestamp },
  ];
  const labels = {
    title: "Skill path",
    unavailableTitle: "Skills unavailable",
    unavailableDescription: "Mastery storage is not configured.",
    nextAction: "Recommended next action",
    blocked: "Prerequisite required",
    mastery: { not_started: "Not started", developing: "Developing", proficient: "Proficient", mastered: "Mastered" },
    score: (value: number) => `${Math.round(value * 100)}% mastery`,
    duration: (minutes: number) => `${minutes} minutes`,
  } as const;

  it("uses human skill labels, flags prerequisites, and defaults absent mastery safely", () => {
    const { rerender } = render(
      <SkillPathOverview
        available
        labels={labels}
        mastery={mastery}
        nextAction={{ skillId: "skill-2", reason: "prerequisite_gap", currentScore: 0, targetScore: 0.8, estimatedMinutes: 60, blockedBy: ["skill-1"] }}
        skills={skills}
      />,
    );
    expect(screen.getAllByText("API evidence")).toHaveLength(2);
    expect(screen.getByText("Prerequisite required")).toHaveClass("badge--warning");
    expect(screen.getByText("Mastered")).toHaveClass("badge--success");
    expect(screen.getByText("Not started")).toHaveClass("badge");
    expect(screen.getByText("0% mastery")).toBeInTheDocument();

    rerender(
      <SkillPathOverview
        available
        labels={labels}
        mastery={[{ ...mastery[0]!, level: "developing", score: 0.35 }]}
        nextAction={{ skillId: "skill-external", reason: "remediation", currentScore: 0.2, targetScore: 0.8, estimatedMinutes: 30, blockedBy: [] }}
        skills={skills}
      />,
    );
    expect(screen.getByRole("heading", { name: "skill-external" })).toBeInTheDocument();
    expect(screen.queryByText("Prerequisite required")).not.toBeInTheDocument();
    expect(screen.getByText("Developing")).toHaveClass("badge");

    rerender(<SkillPathOverview available labels={labels} mastery={[]} skills={[]} />);
    expect(screen.queryByText("Recommended next action")).not.toBeInTheDocument();
  });
});

describe("entitlement denial presenter", () => {
  const labels = {
    not_entitled: { title: "Package required", description: "Your account does not include this course." },
    expired: { title: "Package expired", description: "Renew access to continue." },
    suspended: { title: "Access suspended", description: "Contact your administrator." },
    package_unavailable: { title: "Package unavailable", description: "This package cannot be assigned." },
  };

  it("renders allowed content and a reason-specific denial without leaking children", () => {
    const { rerender } = render(<EntitlementGate decision={{ allowed: true, grantId: "grant-1", packageId: "package-1" }} labels={labels}><p>Protected course</p></EntitlementGate>);
    expect(screen.getByText("Protected course")).toBeInTheDocument();
    rerender(<EntitlementGate decision={{ allowed: false, reason: "expired" }} labels={labels}><p>Protected course</p></EntitlementGate>);
    expect(screen.queryByText("Protected course")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Package expired" })).toBeInTheDocument();
  });
});
