import { describe, expect, it, vi } from "vitest";

import type {
  ContentCommandPort,
  ContentPrincipal,
  CourseContentVersion,
  MediaUploadPort,
} from "./model";
import { buildContentPreview } from "./preview";
import { ContentService } from "./service";
import { validateContentVersion } from "./validation";

const localized = (value: string) => ({ en: value, de: value, ru: value });

function content(overrides: Partial<CourseContentVersion> = {}): CourseContentVersion {
  return {
    id: "version-1",
    organizationId: "org-1",
    courseId: "course-1",
    versionNumber: 1,
    revision: 4,
    state: "draft",
    metadata: { name: localized("Course"), description: localized("Description") },
    stages: [{
      id: "stage-1",
      title: localized("Stage"),
      position: 1,
      startMediaIds: [],
      endMediaIds: [],
      tasks: [{
        id: "task-1",
        title: localized("Task"),
        description: localized("Task description"),
        expectedAnswer: localized("Expected answer"),
        hint: localized("Hint"),
        beforeMediaIds: [],
        afterMediaIds: [],
        bugCategoryIds: [],
        skillIds: ["skill-1"],
        prerequisiteTaskIds: [],
        position: 1,
      }],
    }],
    media: [],
    bugCategories: [],
    prerequisiteCourseIds: [],
    createdBy: "admin-1",
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
    ...overrides,
  };
}

const admin: ContentPrincipal = {
  userId: "admin-1",
  organizationId: "org-1",
  role: "admin",
  permissions: ["content:read", "content:write", "content:publish", "content:archive"],
};

function setup(current: CourseContentVersion) {
  const port: ContentCommandPort = {
    getVersion: vi.fn(async () => current),
    saveDraft: vi.fn(async () => current),
    submitForReview: vi.fn(async () => ({ ...current, state: "in_review" as const })),
    publish: vi.fn(async () => ({ ...current, state: "published" as const })),
    archive: vi.fn(async () => ({ ...current, state: "archived" as const })),
  };
  const uploads: MediaUploadPort = {
    initiateResumableUpload: vi.fn(async () => ({
      uploadId: "upload-1",
      contentVersionId: current.id,
      offset: 0,
      expiresAt: "2026-07-17T10:00:00.000Z",
      status: "ready" as const,
    })),
  };
  return {
    port,
    uploads,
    service: new ContentService(port, uploads, {
      requiredLocales: ["en", "de", "ru"],
      allowedUploadMimeTypes: new Set(["video/mp4"]),
      maximumUploadBytes: 1_000,
    }),
  };
}

describe("content authoring", () => {
  it("submits a complete draft for review with an audit request", async () => {
    const { service, port } = setup(content());
    await service.submitForReview(admin, {
      contentVersionId: "version-1",
      expectedRevision: 4,
      idempotencyKey: "content-key-1",
      correlationId: "correlation-1",
    });
    expect(port.submitForReview).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", expectedRevision: 4 }),
      expect.objectContaining({ eventName: "content.submitted_for_review" }),
    );
  });

  it("publishes only reviewed, valid content", async () => {
    const reviewed = content({ state: "in_review" });
    const { service, port } = setup(reviewed);
    await service.publish(admin, {
      contentVersionId: "version-1",
      expectedRevision: 4,
      idempotencyKey: "content-key-2",
      correlationId: "correlation-2",
    });
    expect(port.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventName: "content.published" }),
    );
  });

  it("keeps published versions immutable", async () => {
    const published = content({ state: "published" });
    const { service, port } = setup(published);
    await expect(service.saveDraft(admin, {
      content: published,
      expectedRevision: 4,
      idempotencyKey: "content-key-3",
      correlationId: "correlation-3",
    })).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(port.saveDraft).not.toHaveBeenCalled();
  });

  it("requires an exact impact fingerprint before archiving", async () => {
    const { service } = setup(content({ state: "published" }));
    await expect(service.archive(admin, {
      contentVersionId: "version-1",
      expectedRevision: 4,
      impactFingerprint: "wrong-value",
      idempotencyKey: "content-key-4",
      correlationId: "correlation-4",
    })).rejects.toMatchObject({ code: "CONTENT_IMPACT_CONFIRMATION_REQUIRED" });
  });

  it("rejects unsafe or oversized media uploads", async () => {
    const { service, uploads } = setup(content());
    await expect(service.initiateUpload(admin, {
      contentVersionId: "version-1",
      fileName: "payload.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 5_000,
      kind: "document",
      idempotencyKey: "content-key-5",
      correlationId: "correlation-5",
    })).rejects.toMatchObject({ code: "CONTENT_UPLOAD_REJECTED" });
    expect(uploads.initiateResumableUpload).not.toHaveBeenCalled();
  });

  it("reports incomplete locales and exposes fallback fields in previews", () => {
    const incomplete = content({
      metadata: { name: { en: "Course", de: "Kurs", ru: "" }, description: localized("Description") },
    });
    expect(validateContentVersion(incomplete, ["en", "de", "ru"]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ locale: "ru" })]));
    expect(buildContentPreview(incomplete, "ru", "learner").fallbackFields)
      .toContain("metadata.name");
  });
});
