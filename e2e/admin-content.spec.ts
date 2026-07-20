import type { Page } from "@playwright/test";

import { expect, test } from "./helpers/seeded-test";

import {
  appUrl,
  captureSuccessfulScreenshot,
  expectAxeClean,
  expectHealthyPage,
  expectNoHorizontalOverflow,
  observeRuntime,
  useSeededSession,
  waitForFonts,
} from "./helpers/runtime";

const COURSE_ID = "01980a20-0000-7000-8000-000000000001";
const VERSION_ID = "01980a22-0000-7000-8000-000000000001";

async function expectNoUnsupportedAuthoringMutations(page: Page): Promise<void> {
  const mutationName =
    /create course|edit course|delete|reorder|upload media/i;
  await expect(page.getByRole("button", { name: mutationName })).toHaveCount(0);
  await expect(page.getByRole("link", { name: mutationName })).toHaveCount(0);
}

test.describe("guarded admin content studio", () => {
  test("seeded admin inspects content and sees only the verified lifecycle control", async ({
    browser,
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "admin");
    await page.goto(appUrl("/en/admin/courses"));
    await waitForFonts(page);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Course content studio",
      }),
    ).toBeVisible();
    await expect(page.getByText("1 course", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Practical Software Testing",
      }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", {
        name: "Content editing remains read-only",
      }),
    ).toBeVisible();
    await expect(page.getByText("EN · Complete", { exact: true })).toBeVisible();
    await expect(page.getByText("DE · Complete", { exact: true })).toBeVisible();
    await expect(page.getByText("RU · Complete", { exact: true })).toBeVisible();
    await expectNoUnsupportedAuthoringMutations(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-course-list-desktop.png",
    );

    await page.getByRole("link", { name: "Open course" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/en/admin/courses/${COURSE_ID}$`),
    );
    await page.waitForLoadState("networkidle");
    await waitForFonts(page);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Practical Software Testing",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Course details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Translations" }),
    ).toBeVisible();
    await expect(page.getByText("Praktisches Softwaretesten", { exact: true })).toBeVisible();
    await expect(page.getByText("Практическое тестирование ПО", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Content editing remains read-only",
      }),
    ).toBeVisible();
    await expectNoUnsupportedAuthoringMutations(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-course-detail-desktop.png",
    );

    await page.getByRole("link", { name: "Inspect version" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/en/admin/courses/${COURSE_ID}/versions/${VERSION_ID}$`,
      ),
    );
    await page.waitForLoadState("networkidle");
    await waitForFonts(page);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Practical Software Testing · Version 1",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stages and tasks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test analysis" })).toBeVisible();
    await expect(page.getByText("Analyze the login flow", { exact: true })).toBeVisible();
    await expect(page.getByText("2 assessment options", { exact: true })).toBeVisible();
    await expect(
      page.getByText("The read-side completeness checks passed.", {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Archive published version" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Current archive impact" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Archive reason" }),
    ).toHaveAttribute("required", "");
    await expect(
      page.getByRole("checkbox", {
        name: "I reviewed these exact impact counts and fingerprint.",
      }),
    ).toHaveAttribute("required", "");
    await expect(
      page.getByRole("button", { name: "Archive version" }),
    ).toBeVisible();
    await expectNoUnsupportedAuthoringMutations(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-version-detail-desktop.png",
    );

    await page
      .getByRole("navigation", { name: "Preview role" })
      .getByRole("link", { name: "Learner" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/en/admin/courses/${COURSE_ID}/versions/${VERSION_ID}/preview\\?role=learner$`,
      ),
    );
    await page.waitForLoadState("networkidle");
    await waitForFonts(page);
    await expect(
      page.getByRole("link", { name: "Learner" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Practical Software Testing",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Read-only reconstructed preview",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Which test-design technique is appropriate?"),
    ).toBeVisible();
    await expect(page.getByText("Boundary analysis", { exact: true })).toBeVisible();
    await expect(page.getByText("Random clicking", { exact: true })).toBeVisible();
    await expect(page.getByText("Trainer-only seed model answer.", { exact: true })).toHaveCount(0);
    await expectNoUnsupportedAuthoringMutations(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-preview-learner-desktop.png",
    );

    await page
      .getByRole("navigation", { name: "Preview role" })
      .getByRole("link", { name: "Administrator" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/en/admin/courses/${COURSE_ID}/versions/${VERSION_ID}/preview\\?role=admin$`,
      ),
    );
    await page.waitForLoadState("networkidle");
    await waitForFonts(page);
    await expect(
      page.getByRole("link", { name: "Administrator" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Trainer-only seed model answer.", { exact: true })).toHaveCount(0);
    await expectNoUnsupportedAuthoringMutations(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-preview-admin-desktop.png",
    );
    await expectHealthyPage(page, runtime);
  });

  test("DE and RU localized previews resolve cleanly and the RU mobile projection has no overflow", async ({
    browser,
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "admin");
    await page.goto(
      appUrl(
        `/de/admin/courses/${COURSE_ID}/versions/${VERSION_ID}/preview?role=learner`,
      ),
    );
    await waitForFonts(page);

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Praktisches Softwaretesten",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Lernende" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("heading", { name: "Testanalyse" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Login-Ablauf analysieren" })).toBeVisible();
    await expect(
      page.getByText("Welche Testentwurfstechnik ist geeignet?"),
    ).toBeVisible();
    await expect(page.getByText("Grenzwertanalyse", { exact: true })).toBeVisible();
    await expect(page.getByText(/Fallback aus [A-Z]{2}/)).toHaveCount(0);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-preview-de-desktop.png",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      appUrl(
        `/ru/admin/courses/${COURSE_ID}/versions/${VERSION_ID}/preview?role=learner`,
      ),
    );
    await waitForFonts(page);

    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Практическое тестирование ПО",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Учащийся" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("heading", { name: "Анализ", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Анализ входа" })).toBeVisible();
    await expect(
      page.getByText("Какой метод проектирования тестов подходит?"),
    ).toBeVisible();
    await expect(page.getByText("Анализ границ", { exact: true })).toBeVisible();
    await expect(page.getByText(/Резервный перевод: [A-Z]{2}/)).toHaveCount(0);
    await expectNoUnsupportedAuthoringMutations(page);
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "admin/content-preview-ru-mobile.png",
    );
    await expectHealthyPage(page, runtime);
  });
});
