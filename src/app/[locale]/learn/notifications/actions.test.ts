import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/[locale]/_data/principal", () => ({ getPrincipal: vi.fn() }));
vi.mock("@/shared/database/server", () => ({ createServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { createServerClient } from "@/shared/database/server";
import type { Principal } from "@/shared/auth/types";

import { markLearnerNotificationReadAction } from "./actions";

const principal: Principal = {
  userId: "01980a00-0000-7000-8000-000000000001",
  sessionId: "session",
  organizationId: "01980a10-0000-7000-8000-000000000001",
  primaryRole: "learner",
  roles: ["learner"],
  permissions: [],
  cohortIds: [],
};

function readFormData() {
  const formData = new FormData();
  formData.set(
    "notificationId",
    "01980c10-0000-7000-8000-000000000001",
  );
  formData.set("expectedVersion", "1");
  formData.set("idempotencyKey", "notification-action-test-0001");
  return formData;
}

function clientFixture(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return {
    from: vi.fn().mockReturnValue(builder),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
}

describe("markLearnerNotificationReadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrincipal).mockResolvedValue(principal);
  });

  it("fails closed when the RLS ownership re-read returns no notification", async () => {
    const client = clientFixture(null);
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(markLearnerNotificationReadAction("en", {
      status: "idle",
      message: "",
    }, readFormData())).resolves.toMatchObject({
      status: "error",
      message: "This notification is not available to your account.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("allows an identical old-version retry to reach the idempotency receipt", async () => {
    const client = clientFixture({
      id: "01980c10-0000-7000-8000-000000000001",
      recipient_id: principal.userId,
      row_version: 2,
      read_at: "2026-07-18T12:00:00.000Z",
      cancelled_at: null,
      state: "pending",
    });
    vi.mocked(createServerClient).mockResolvedValue(client as never);
    await expect(markLearnerNotificationReadAction("en", {
      status: "idle",
      message: "",
    }, readFormData())).resolves.toEqual({
      status: "success",
      message: "Notification marked as read.",
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "mark_notification_read",
      expect.objectContaining({
        p_expected_version: 1,
        p_idempotency_key: "notification-action-test-0001",
      }),
    );
  });
});
