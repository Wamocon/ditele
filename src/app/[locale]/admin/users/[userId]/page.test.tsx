import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canRenderProtectedPageMock,
  getPrincipalMock,
  notFoundMock,
  readAdminMemberDetailMock,
} = vi.hoisted(() => ({
  canRenderProtectedPageMock: vi.fn(),
  getPrincipalMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("route-not-found");
  }),
  readAdminMemberDetailMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/app/[locale]/_data/principal", () => ({
  canRenderProtectedPage: canRenderProtectedPageMock,
  getPrincipal: getPrincipalMock,
}));
vi.mock("@/features/administration/admin-member-detail-data", () => ({
  readAdminMemberDetail: readAdminMemberDetailMock,
}));
vi.mock("@/features/administration/components/admin-member-detail", () => ({
  AdminMemberDetailView: ({ detail }: { readonly detail: { readonly profile: { readonly displayName: string } } }) => (
    <div>detail:{detail.profile.displayName}</div>
  ),
}));

import AdminMemberDetailPage from "./page";

const organizationId = "01980a10-0000-7000-8000-000000000001";
const userId = "01980a00-0000-7000-8000-000000000001";
const principal = {
  userId: "01980a00-0000-7000-8000-000000000004",
  sessionId: "admin-session",
  organizationId,
  primaryRole: "admin" as const,
  roles: ["admin"] as const,
  permissions: ["organization.manage"],
  cohortIds: [],
};

describe("admin member detail route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid target before executing an authorization or data read", async () => {
    await expect(
      AdminMemberDetailPage({
        params: Promise.resolve({ locale: "en", userId: "not-a-uuid" }),
      }),
    ).rejects.toThrow("route-not-found");
    expect(canRenderProtectedPageMock).not.toHaveBeenCalled();
    expect(readAdminMemberDetailMock).not.toHaveBeenCalled();
  });

  it("does not resolve a principal or target when the admin role gate denies the page", async () => {
    canRenderProtectedPageMock.mockResolvedValueOnce(false);

    await expect(
      AdminMemberDetailPage({
        params: Promise.resolve({ locale: "en", userId }),
      }),
    ).resolves.toBeNull();
    expect(canRenderProtectedPageMock).toHaveBeenCalledWith(
      "en",
      `/en/admin/users/${userId}`,
      ["admin", "content_admin"],
    );
    expect(getPrincipalMock).not.toHaveBeenCalled();
    expect(readAdminMemberDetailMock).not.toHaveBeenCalled();
  });

  it("renders a localized forbidden state before the target read when permission is absent", async () => {
    canRenderProtectedPageMock.mockResolvedValueOnce(true);
    getPrincipalMock.mockResolvedValueOnce({ ...principal, permissions: [] });

    render(await AdminMemberDetailPage({
      params: Promise.resolve({ locale: "de", userId }),
    }));

    expect(screen.getByRole("heading", { name: "Keine Mitgliedsadministration" })).toBeInTheDocument();
    expect(readAdminMemberDetailMock).not.toHaveBeenCalled();
  });

  it("uses a safe not-found result for an absent or cross-tenant member", async () => {
    canRenderProtectedPageMock.mockResolvedValueOnce(true);
    getPrincipalMock.mockResolvedValueOnce(principal);
    readAdminMemberDetailMock.mockResolvedValueOnce(null);

    await expect(AdminMemberDetailPage({
      params: Promise.resolve({ locale: "en", userId }),
    })).rejects.toThrow("route-not-found");
    expect(readAdminMemberDetailMock).toHaveBeenCalledWith(
      principal,
      "en",
      userId,
    );
  });

  it("renders the validated authorized projection", async () => {
    canRenderProtectedPageMock.mockResolvedValueOnce(true);
    getPrincipalMock.mockResolvedValueOnce(principal);
    readAdminMemberDetailMock.mockResolvedValueOnce({
      profile: { displayName: "Lena Learner" },
    });

    render(await AdminMemberDetailPage({
      params: Promise.resolve({ locale: "ru", userId }),
    }));
    expect(screen.getByText("detail:Lena Learner")).toBeInTheDocument();
  });
});
