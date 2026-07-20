import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { adminGroupsCopy, adminSettingsCopy, adminUsersCopy } from "../management-read-copy";
import type { AdminGroupListItem, AdminOrganizationSettings, AdminUserDirectoryItem } from "../management-read-model";
import { AdminGroupsView, AdminSettingsView, AdminUsersView } from "./management-read-views";

const group: AdminGroupListItem = {
  id: "01980a30-0000-7000-8000-000000000001",
  name: "Release 0 Cohort",
  courseTitle: "Practical Software Testing",
  courseResolvedLocale: "en",
  courseUsedFallback: false,
  state: "active",
  progressionMode: "scheduled",
  startsAt: "2026-07-18T08:00:00.000Z",
  endsAt: null,
  capacity: 25,
  learnerCount: 8,
  trainerCount: 2,
  updatedAt: "2026-07-18T10:00:00.000Z",
};

const restrictedMember: AdminUserDirectoryItem = {
  membershipId: "01980a11-0000-7000-8000-000000000001",
  userId: "01980a00-0000-7000-8000-000000000001",
  displayName: null,
  profileVisible: false,
  profileLocale: null,
  profileState: null,
  membershipState: "active",
  joinedAt: null,
  validUntil: null,
  createdAt: "2026-07-18T08:00:00.000Z",
  roles: [{ code: "learner", cohortScoped: false }],
};

const settings: AdminOrganizationSettings = {
  organization: {
    id: "01980a10-0000-7000-8000-000000000001",
    slug: "ditele-academy",
    name: "DiTeLe Academy",
    state: "active",
    dataResidencyRegion: "eu-central",
    updatedAt: "2026-07-18T10:00:00.000Z",
  },
  entitlements: [{
    id: "01980a41-0000-7000-8000-000000000001",
    capability: "learning",
    packageCode: "academy-core",
    packageLabel: "Academy Core",
    packageState: "active",
    scope: "organization",
    validFrom: "2026-07-18T08:00:00.000Z",
    validUntil: null,
    source: "contract",
  }],
  integrations: [],
};

describe("administration management read views", () => {
  it("renders real group capacity and membership without fake commands", () => {
    render(<AdminGroupsView items={[group]} labels={adminGroupsCopy.en} locale="en" page={1} total={1} totalPages={1} />);
    const article = screen.getByRole("article");
    expect(within(article).getByRole("heading", { name: "Release 0 Cohort" })).toBeInTheDocument();
    expect(within(article).getByText("8 of 25 active learners")).toBeInTheDocument();
    expect(within(article).getByText("2 active trainers")).toBeInTheDocument();
    expect(
      within(article).getByRole("link", { name: "Open group workspace" }),
    ).toHaveAttribute("href", `/en/admin/groups/${group.id}`);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains an unavailable active profile projection without rendering the user UUID as a name", () => {
    render(<AdminUsersView items={[restrictedMember]} labels={adminUsersCopy.en} locale="en" page={1} total={1} totalPages={1} />);
    expect(screen.getByRole("heading", { name: "Display name unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/active member-profile projection/i)).toBeInTheDocument();
    expect(screen.queryByText(restrictedMember.userId)).not.toBeInTheDocument();
    expect(screen.getByText(/Learner · Organization scope/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open member details" }),
    ).toHaveAttribute("href", `/en/admin/users/${restrictedMember.userId}`);
    expect(screen.queryByRole("button", { name: /invite|remove|grant/i })).not.toBeInTheDocument();
  });

  it("separates integration authorization from organization settings and exposes no secret fields", () => {
    const { container } = render(
      <AdminSettingsView
        canReadIntegrations={false}
        entitlementTotal={1}
        integrationTotal={0}
        itemLimit={100}
        labels={adminSettingsCopy.en}
        locale="en"
        settings={settings}
      />,
    );
    expect(screen.getByRole("heading", { name: "DiTeLe Academy" })).toBeInTheDocument();
    expect(screen.getByText("Academy Core")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Integration metadata not granted" })).toBeInTheDocument();
    expect(screen.getByText(/No integration table query was performed/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/secret_reference|configuration_redacted/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
