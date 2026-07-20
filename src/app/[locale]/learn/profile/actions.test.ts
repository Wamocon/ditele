import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";
import type { Principal } from "@/shared/auth/types";

import { updateLearnerProfileAction } from "./actions";

const principal: Principal = {
  userId: "01980a00-0000-7000-8000-000000000001",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: ["profile.update_self"],
  cohortIds: [],
};

function validFormData() {
  const formData = new FormData();
  formData.set("displayName", "Lena Quality");
  formData.set("locale", "de");
  formData.set("timezone", "Europe/Berlin");
  formData.set("expectedVersion", "1");
  formData.set("idempotencyKey", "profile-action-test-0001");
  return formData;
}

describe("updateLearnerProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrincipal).mockResolvedValue(principal);
  });

  it("rejects invalid profile input before authentication", async () => {
    const formData = validFormData();
    formData.set("timezone", "Mars/Olympus");
    await expect(updateLearnerProfileAction("en", {
      status: "idle",
      message: "",
    }, formData)).resolves.toMatchObject({ status: "error" });
    expect(getPrincipal).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("re-reads ownership but lets the receipt-aware RPC decide an old version replay", async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { user_id: principal.userId, row_version: 2 },
        error: null,
      }),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    const client = {
      from: vi.fn().mockReturnValue(builder),
      rpc: vi.fn().mockResolvedValue({ data: { row_version: 2 }, error: null }),
    };
    vi.mocked(createServerClient).mockResolvedValue(client as never);

    await expect(updateLearnerProfileAction("en", {
      status: "idle",
      message: "",
    }, validFormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(client.rpc).toHaveBeenCalledWith("update_own_profile", expect.objectContaining({
      p_expected_version: 1,
      p_idempotency_key: "profile-action-test-0001",
    }));
  });
});
