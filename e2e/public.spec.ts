import { expect, test } from "@playwright/test";

import {
  appUrl,
  captureSuccessfulScreenshot,
  expectAxeClean,
  expectHealthyPage,
  expectNoHorizontalOverflow,
  observeRuntime,
} from "./helpers/runtime";

const localeCases = [
  {
    catalogCta: "Explore courses",
    locale: "en",
    course: "Practical Software Testing",
  },
  {
    catalogCta: "Kurse entdecken",
    locale: "de",
    course: "Praktisches Softwaretesten",
  },
  {
    catalogCta: "Посмотреть курсы",
    locale: "ru",
    course: "Практическое тестирование ПО",
  },
] as const;

test.describe("real-database public localized experience", () => {
  for (const { catalogCta, course, locale } of localeCases) {
    test(`${locale} home and seeded catalog render accessibly`, async ({ page }, testInfo) => {
      const runtime = observeRuntime(page);

      await page.goto(appUrl(`/${locale}`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const catalogLink = page.getByRole("link", { name: catalogCta });
      await expect(catalogLink).toBeVisible();
      await expectAxeClean(page);
      await expectNoHorizontalOverflow(page);

      await catalogLink.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/catalog/?$`));
      await expect(page.getByRole("heading", { name: course })).toBeVisible();
      await expectAxeClean(page);
      await expectHealthyPage(page, runtime);

      await captureSuccessfulScreenshot(
        page,
        testInfo,
        `public/catalog-${locale}-desktop.png`,
      );
    });

    test(`${locale} seeded course detail is loaded from Supabase`, async ({ page }, testInfo) => {
      const runtime = observeRuntime(page);
      await page.goto(appUrl(`/${locale}/catalog/practical-software-testing`));

      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { name: course, level: 1 })).toBeVisible();
      await expectAxeClean(page);
      await expectHealthyPage(page, runtime);
      await captureSuccessfulScreenshot(
        page,
        testInfo,
        `public/course-${locale}-desktop.png`,
      );
    });
  }

  test("unprefixed privacy route preserves its destination under the default locale", async ({ page }) => {
    const runtime = observeRuntime(page);
    await page.goto(appUrl("/privacy"));
    await expect(page).toHaveURL(/\/en\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Privacy");
    await expectHealthyPage(page, runtime);
  });

  test("mobile catalog has no overflow and keeps the primary content reachable", async ({ page }, testInfo) => {
    const runtime = observeRuntime(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(appUrl("/en/catalog"));

    await expect(page.getByRole("heading", { name: "Practical Software Testing" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);

    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "public/catalog-en-mobile.png",
    );
  });
});
