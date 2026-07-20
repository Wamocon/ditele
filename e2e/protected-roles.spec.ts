import { expect, test } from "./helpers/seeded-test";

import {
  appUrl,
  captureSuccessfulScreenshot,
  expectAxeClean,
  expectHealthyPage,
  expectNoHorizontalOverflow,
  expectVisibleAuthenticatedIdentity,
  observeRuntime,
  useSeededSession,
} from "./helpers/runtime";

test.describe("server-enforced protected role surfaces", () => {
  for (const path of [
    "/en/learn",
    "/en/trainer",
    "/en/admin",
    "/en/organization",
  ] as const) {
    test(`guest request to ${path} redirects to login`, async ({ page }) => {
      const runtime = observeRuntime(page);
      await page.goto(appUrl(path));

      await expect(page).toHaveURL(/\/en\/auth\/login\?next=/);
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expectHealthyPage(page, runtime);
    });
  }

  test("learner sees seeded learning data but not trainer content", async ({ browser, context, page }, testInfo) => {
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "learner");
    await page.goto(appUrl("/en/learn"));

    await expect(
      page
        .getByRole("region", { name: "Next best action" })
        .getByRole("heading", { name: "Analyze the login flow" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Active courses" })
        .getByRole("heading", { name: "Practical Software Testing" }),
    ).toBeVisible();
    await expectVisibleAuthenticatedIdentity(page, "Lena Learner", "Learner");
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(page, testInfo, "learner/dashboard-desktop.png");

    await page.goto(appUrl("/en/trainer"));
    await expect(page.getByRole("heading", { name: "You do not have access" })).toBeVisible();
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(page, testInfo, "learner/forbidden-trainer-desktop.png");
  });

  test("trainer sees the real review queue and is denied admin content", async ({ browser, context, page }, testInfo) => {
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "trainer");
    await page.goto(appUrl("/en/trainer"));

    await expectVisibleAuthenticatedIdentity(page, "Theo Trainer", "Trainer");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(page, testInfo, "trainer/queue-desktop.png");

    await page.goto(appUrl("/en/admin"));
    await expect(page.getByRole("heading", { name: "You do not have access" })).toBeVisible();
    await expectHealthyPage(page, runtime);
  });

  test("admin sees real operations data and is denied learner content", async ({ browser, context, page }, testInfo) => {
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "admin");
    await page.goto(appUrl("/en/admin"));

    await expectVisibleAuthenticatedIdentity(
      page,
      "Ada Admin",
      "Administrator",
    );
    await expect(page.getByRole("heading", { name: "Administration overview" })).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalOverflow(page);
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(page, testInfo, "admin/operations-desktop.png");

    await page.goto(appUrl("/en/learn"));
    await expect(page.getByRole("heading", { name: "You do not have access" })).toBeVisible();
    await expectHealthyPage(page, runtime);
  });

  test("organization admin reaches only the tenant administration surface", async ({ browser, context, page }, testInfo) => {
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "organizationAdmin");
    await page.goto(appUrl("/en/organization"));

    await expectVisibleAuthenticatedIdentity(
      page,
      "Olivia Organization Admin",
      "Organization administrator",
    );
    await expect(
      page.getByRole("heading", { name: "Organization administration" }),
    ).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalOverflow(page);
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "organization/administration-desktop.png",
    );

    await page.goto(appUrl("/en/admin"));
    await expect(
      page.getByRole("heading", { name: "You do not have access" }),
    ).toBeVisible();
    await expectHealthyPage(page, runtime);
  });

  test("learner dashboard remains usable at a mobile viewport", async ({ browser, context, page }, testInfo) => {
    const runtime = observeRuntime(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await useSeededSession(browser, context, "learner");
    await page.goto(appUrl("/en/learn"));

    await expect(page.getByRole("heading", { name: "My learning" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(page, testInfo, "learner/dashboard-mobile.png");
  });
});
