import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { recommendCourse } from "@/features/catalog/model/recommendation";
import { QuestionComposer } from "@/features/mentoring/components/question-composer";
import type { CreateQuestionInput, QuestionThread } from "@/features/mentoring/model/question";
import { organizationWorkspaceCopy } from "@/app/[locale]/organization/copy";
import {
  auditEventInputSchema,
  commandContextSchema,
  notificationInputSchema,
} from "@/shared/api/contracts/commands";
import {
  cursorPageSchema,
  errorEnvelopeSchema,
  successEnvelopeSchema,
} from "@/shared/api/contracts/common";
import {
  createQuestionInputSchema,
  requestEnrollmentInputSchema,
  saveAttemptDraftInputSchema,
  submitAttemptInputSchema,
} from "@/shared/api/contracts/learning";
import {
  legacyEnvelopeSchema,
  legacyGroupSchema,
  legacyQuestionSchema,
  legacySolvingSchema,
} from "@/shared/api/contracts/legacy";
import {
  loginInputSchema,
  registrationInputSchema,
  sessionPrincipalSchema,
} from "@/shared/api/contracts/session";
import { getPublicEnvironment } from "@/shared/config/env";
import { isLocale } from "@/shared/i18n/config";
import enMessages from "@/shared/i18n/messages/en.json";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";
import { AppShell } from "@/shared/ui/app-shell";
import { Badge } from "@/shared/ui/badge";
import { BrandLink } from "@/shared/ui/brand-link";
import { Field, Input, Textarea } from "@/shared/ui/field";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { PublicHeader } from "@/shared/ui/public-header";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const timestamp = "2026-07-18T08:00:00.000Z";
const uuid = "01980a20-0000-7000-8000-000000000001";

describe("shared UI", () => {
  it("switches theme deterministically and persists the user's choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle label="Toggle theme" />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("ditele-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("ditele-theme")).toBe("light");
  });

  it("renders field descriptions, accessible errors, and normalized control classes", () => {
    render(
      <Field description="Use a work address" error="Email is required" htmlFor="email" label="Email">
        <Input aria-describedby="email-error" className="custom-input" id="email" />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).toHaveClass("input", "custom-input");
    expect(screen.getByRole("alert")).toHaveTextContent("Email is required");
    expect(screen.getByText("Use a work address")).toHaveClass("field__description");

    const { rerender } = render(<Textarea aria-label="Evidence" className="wide" />);
    expect(screen.getByLabelText("Evidence")).toHaveClass("textarea", "wide");
    rerender(<Badge>Neutral</Badge>);
    expect(screen.getByText("Neutral")).toHaveClass("badge");
    rerender(<Badge tone="danger">Blocked</Badge>);
    expect(screen.getByText("Blocked")).toHaveClass("badge--danger");
  });

  it("builds locale-aware brand, switcher, and public navigation links", () => {
    const { rerender } = render(<BrandLink locale="de" />);
    expect(screen.getByRole("link", { name: "DiTeLe home" })).toHaveAttribute("href", "/de");
    expect(screen.getByRole("img", { name: "DiTeLe" })).toHaveAttribute("src", expect.stringContaining("ditele-logo.svg"));

    rerender(<LocaleSwitcher locale="ru" suffix="/catalog/testing-foundations" />);
    expect(screen.getByRole("link", { name: "ru" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "de" })).toHaveAttribute("href", "/de/catalog/testing-foundations");

    rerender(<PublicHeader locale="en" messages={enMessages} />);
    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(primaryNavigation).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole("link", { name: enMessages.nav.catalog })).toHaveAttribute("href", "/en/catalog");
    expect(within(primaryNavigation).getByRole("link", { name: enMessages.nav.about })).toHaveAttribute("href", "/en/about");
    expect(within(primaryNavigation).getByRole("link", { name: enMessages.common.signIn })).toHaveAttribute("href", "/en/auth/login");
  });

  it("renders role-specific navigation, active location, sign-out, initials, and role-view warning", () => {
    const signOutAction = vi.fn(async () => undefined);
    const { rerender } = render(
      <AppShell
        activeHref="/en/learn/questions"
        breadcrumbs="Home / Questions"
        impersonating
        locale="en"
        messages={enMessages}
        role="student"
        signOutAction={signOutAction}
        userName="Ada Learner"
      >
        <p>Student workspace</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: `${enMessages.roles.student} navigation` })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: enMessages.nav.questions })[0]).toHaveAttribute("aria-current", "page");
    expect(
      screen.getAllByRole("link", { name: enMessages.nav.learningHistory })[0],
    ).toHaveAttribute("href", "/en/learn/history");
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: enMessages.common.signOut })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(enMessages.admin.impersonation);

    rerender(
      <AppShell activeHref="/de/trainer/submissions" breadcrumbs="Queue" locale="de" messages={enMessages} role="trainer" userName="Toni">
        <p>Trainer workspace</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: `${enMessages.roles.trainer} navigation` })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: enMessages.nav.submissions })[0]).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: enMessages.common.signOut })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(
      <AppShell activeHref="/ru/admin/courses" breadcrumbs="Admin" locale="ru" messages={enMessages} role="admin" userName="System Admin">
        <p>Admin workspace</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: `${enMessages.roles.admin} navigation` })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: enMessages.nav.courses })[0]).toHaveAttribute("aria-current", "page");
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>(".app-shell__nav a")].map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual([
      "/ru/admin",
      "/ru/admin/courses",
      "/ru/admin/tasks",
      "/ru/admin/groups",
      "/ru/admin/users",
      "/ru/admin/applications",
      "/ru/admin/settings",
    ]);

    rerender(
      <AppShell activeHref="/en/admin/courses" breadcrumbs="Content" locale="en" messages={enMessages} role="contentAdmin" userName="Content Admin">
        <p>Content workspace</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: `${enMessages.roles.contentAdmin} navigation` })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: enMessages.nav.courses })[0]).toHaveAttribute("aria-current", "page");
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>(".app-shell__nav a")].map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual(["/en/admin/courses", "/en/admin/tasks"]);
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>(".mobile-nav__panel a")].map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual(["/en/admin/courses", "/en/admin/tasks"]);
    expect(document.querySelectorAll('a[href="/en/admin"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="/en/admin/groups"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="/en/admin/users"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="/en/admin/applications"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="/en/admin/settings"]')).toHaveLength(0);

    rerender(
      <AppShell activeHref="/en/organization" breadcrumbs="Organization" locale="en" messages={enMessages} role="organizationAdmin" userName="Org Admin">
        <p>Organization workspace</p>
      </AppShell>,
    );
    expect(screen.getByRole("complementary", { name: `${enMessages.roles.organizationAdmin} navigation` })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: enMessages.nav.overview })).toHaveLength(2);
    expect(document.querySelectorAll('.app-shell__nav a[href="/en/organization"]')).toHaveLength(1);
    expect(document.querySelectorAll('.mobile-nav__panel a[href="/en/organization"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href^="/en/admin"]')).toHaveLength(0);
  });
});

describe("QuestionComposer", () => {
  const labels = { label: "Ask your trainer", error: "Enter a question", sending: "Sending…", send: "Send question" };
  const thread: QuestionThread = {
    id: "question-1",
    taskId: "task-1",
    learnerId: "learner-1",
    groupId: "group-1",
    state: "open",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    transferHistory: [],
    history: [],
  };

  it("rejects blank text before transport and exposes the error relationship", async () => {
    const create = vi.fn(async (input: CreateQuestionInput) => {
      void input;
      return thread;
    });
    const user = userEvent.setup();
    render(<QuestionComposer create={create} groupId="group-1" labels={labels} onCreated={vi.fn()} taskId="task-1" />);
    await user.click(screen.getByRole("button", { name: "Send question" }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a question");
    expect(screen.getByLabelText("Ask your trainer")).toHaveAttribute("aria-describedby", "question-task-1-error");
  });

  it("locks duplicate submission while pending, reports success, clears text, and rotates idempotency", async () => {
    let resolveCreate: ((value: QuestionThread) => void) | undefined;
    const create = vi.fn((input: CreateQuestionInput) => {
      void input;
      return new Promise<QuestionThread>((resolve) => { resolveCreate = resolve; });
    });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<QuestionComposer create={create} groupId="group-1" labels={labels} onCreated={onCreated} taskId="task-1" />);
    const textarea = screen.getByLabelText("Ask your trainer");
    await user.type(textarea, "Could you explain the boundary partition?");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled());
    expect(create).toHaveBeenCalledTimes(1);
    const firstInput = create.mock.calls[0]?.[0];
    expect(firstInput).toMatchObject({ taskId: "task-1", groupId: "group-1", body: "Could you explain the boundary partition?" });
    expect(firstInput?.idempotencyKey).toMatch(/^question-/);

    resolveCreate?.(thread);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(thread));
    expect(textarea).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send question" })).toBeEnabled();
  });

  it("turns transport failures into an actionable error state", async () => {
    const create = vi.fn(async (input: CreateQuestionInput) => {
      void input;
      throw new Error("provider unavailable");
    });
    const user = userEvent.setup();
    render(<QuestionComposer create={create} groupId="group-1" labels={labels} onCreated={vi.fn()} taskId="task-1" />);
    await user.type(screen.getByLabelText("Ask your trainer"), "Can a trainer help with this result?");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Enter a question"));
  });
});

describe("canonical API contracts and locale utilities", () => {
  it("builds success, cursor, and error envelopes with correlation validation", () => {
    const itemSchema = z.object({ id: z.string(), value: z.number() });
    expect(successEnvelopeSchema(itemSchema).parse({ data: { id: "item-1", value: 3 }, meta: { correlation_id: uuid } }).data.value).toBe(3);
    expect(cursorPageSchema(itemSchema).parse({ data: [{ id: "item-1", value: 3 }], meta: { correlation_id: uuid, next_cursor: null } }).data).toHaveLength(1);
    expect(errorEnvelopeSchema.safeParse({ error: { code: "forbidden", message_key: "errors.forbidden", field_errors: {}, correlation_id: uuid, retryable: false } }).success).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ error: { code: "", correlation_id: "not-a-uuid" } }).success).toBe(false);
  });

  it("validates session, command, enrollment, attempt, question, and legacy boundaries", () => {
    const audit = { eventType: "task.submitted", aggregateType: "attempt", aggregateId: uuid, correlationId: uuid, metadata: {} };
    const notification = { recipientId: uuid, eventType: "task.submitted", templateKey: "task.submitted", deduplicationKey: "submission-1", payload: {} };
    expect(auditEventInputSchema.parse(audit).metadata).toEqual({});
    expect(notificationInputSchema.parse(notification).recipientId).toBe(uuid);
    expect(commandContextSchema.parse({ expectedVersion: 1, idempotencyKey: "idempotency-key-0001", audit, notification }).expectedVersion).toBe(1);
    expect(sessionPrincipalSchema.safeParse({ userId: uuid, sessionId: "session-1", organizationId: null, primaryRole: "learner", roles: ["learner"], permissions: ["task.read"], cohortIds: [uuid] }).success).toBe(true);
    expect(loginInputSchema.safeParse({ email: "learner@example.com", password: "123123123" }).success).toBe(true);
    expect(registrationInputSchema.safeParse({ email: "learner@example.com", password: "Secure-Password-123!", displayName: "Ada", locale: "de" }).success).toBe(true);
    expect(requestEnrollmentInputSchema.safeParse({ courseId: uuid, requestNote: null, idempotencyKey: "idempotency-key-0001" }).success).toBe(true);
    expect(saveAttemptDraftInputSchema.safeParse({ attemptId: uuid, expectedVersion: 0, answerText: "draft", selectedOptionIds: [], evidenceDraft: [] }).success).toBe(true);
    expect(submitAttemptInputSchema.safeParse({ attemptId: uuid, expectedVersion: 1, idempotencyKey: "idempotency-key-0001", answerText: "evidence", selectedOptionIds: [], evidenceRefs: [], correlationId: uuid }).success).toBe(true);
    expect(createQuestionInputSchema.safeParse({ cohortId: uuid, taskId: uuid, subject: "Boundary result", body: "Could you guide me?", idempotencyKey: "idempotency-key-0001", correlationId: uuid }).success).toBe(true);
    expect(legacyEnvelopeSchema.parse({ status: 1, message: null }).message).toBeNull();
    expect(legacyGroupSchema.parse({ id: 1, is_active: null }).is_active).toBeNull();
    expect(legacySolvingSchema.parse({ id: 1 }).solving_status).toBeUndefined();
    expect(legacyQuestionSchema.parse({ id: 1, is_answered: false, trainer_id: null }).trainer_id).toBeNull();
  });

  it("validates and normalizes recommendation input before trusting gateway output", async () => {
    const result = {
      course: {
        id: "course-1",
        slug: "testing-foundations",
        version: 1,
        title: { en: "Testing foundations" },
        summary: { en: "Practical foundations" },
        durationMinutes: 90,
        taskCount: 4,
        availability: "open" as const,
        tags: [],
        publishedAt: timestamp,
      },
      reason: "Matches a new learner's practical goal.",
      source: "rules" as const,
      correlationId: "correlation-1",
    };
    const gateway = { recommend: vi.fn(async () => result) };
    await expect(recommendCourse(gateway, { locale: "en", learningGoal: "Learn practical software testing", experienceLevel: "new", weeklyMinutes: 120 })).resolves.toEqual(result);
    expect(gateway.recommend).toHaveBeenCalledWith(expect.objectContaining({ weeklyMinutes: 120 }));
    await expect(recommendCourse(gateway, { locale: "en", learningGoal: "short", experienceLevel: "new", weeklyMinutes: 120 })).rejects.toThrow();
    expect(gateway.recommend).toHaveBeenCalledTimes(1);
    await expect(recommendCourse({ recommend: vi.fn(async () => ({ source: "invented" })) }, { locale: "en", learningGoal: "Learn practical software testing", experienceLevel: "new", weeklyMinutes: 120 })).rejects.toThrow();
  });

  it("guards locales and creates stable localized routes", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(localizedRoute("de", "/privacy")).toBe("/de/privacy");
    expect(localizedRoute("de", "/about")).toBe("/de/about");
    expect(localizedRoute("de", "/organization")).toBe("/de/organization");
    expect(localizedDynamicRoute("ru", "/learn/tasks/task-1")).toBe("/ru/learn/tasks/task-1");
  });

  it("keeps the blocked organization workspace explicit in every supported locale", () => {
    expect(organizationWorkspaceCopy.en.status).toBe("Unavailable");
    expect(organizationWorkspaceCopy.de.status).toBe("Nicht verfügbar");
    expect(organizationWorkspaceCopy.ru.status).toBe("Недоступно");
    for (const labels of Object.values(organizationWorkspaceCopy)) {
      expect(labels.blockedTitle).not.toHaveLength(0);
      expect(labels.blockedDescription).not.toHaveLength(0);
    }
  });

  it("parses public browser configuration and rejects missing credentials", () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:56721";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
    expect(getPublicEnvironment()).toEqual({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56721", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key" });
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getPublicEnvironment()).toThrow();
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  });
});
