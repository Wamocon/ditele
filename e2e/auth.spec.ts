import { expect, test } from "./helpers/seeded-test";

import {
  appUrl,
  captureSuccessfulScreenshot,
  expectAxeClean,
  expectHealthyPage,
  expectVisibleAuthenticatedIdentity,
  observeRuntime,
  SEEDED_PASSWORD,
  SEEDED_USERS,
  signIn,
} from "./helpers/runtime";

test.describe("real Supabase authentication", () => {
  for (const scenario of [
    {
      destination: "/en/learn",
      localizedRole: "Learner",
      role: "learner",
      user: SEEDED_USERS.learner,
    },
    {
      destination: "/en/trainer",
      localizedRole: "Trainer",
      role: "trainer",
      user: SEEDED_USERS.trainer,
    },
    {
      destination: "/en/admin",
      localizedRole: "Administrator",
      role: "admin",
      user: SEEDED_USERS.admin,
    },
    {
      destination: "/en/organization",
      localizedRole: "Organization administrator",
      role: "organization admin",
      user: SEEDED_USERS.organizationAdmin,
    },
  ] as const) {
    test(`seeded ${scenario.role} receives the server-derived landing page`, async ({ page }) => {
      const runtime = observeRuntime(page);
      await page.goto(appUrl("/en/auth/login"));
      await page.getByLabel("Email address").fill(scenario.user.email);
      await page.getByLabel("Password").fill(SEEDED_PASSWORD);
      await page.getByRole("button", { name: "Sign in securely" }).click();

      await expect(page).toHaveURL(
        new RegExp(`${scenario.destination.replaceAll("/", "\\/")}/?$`),
      );
      await expectVisibleAuthenticatedIdentity(
        page,
        scenario.user.name,
        scenario.localizedRole,
      );
      await expectHealthyPage(page, runtime);
    });
  }

  test("invalid credentials return a non-specific error", async ({ page }) => {
    const runtime = observeRuntime(page);
    await page.goto(appUrl("/en/auth/login"));
    await page.getByLabel("Email address").fill("unknown@ditele.local");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in securely" }).click();

    await expect(page).toHaveURL(/\/en\/auth\/login\?error=invalid$/);
    await expect(page.getByRole("status")).toHaveText(
      "Check the entered information and try again.",
    );
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);
  });

  test("password reset response does not disclose whether an account exists", async ({ page }) => {
    const runtime = observeRuntime(page);
    await page.goto(appUrl("/en/auth/reset-password"));
    await page.getByLabel("Email address").fill("unknown@ditele.local");
    await page.getByRole("button", { name: /reset|send/i }).click();

    await expect(page).toHaveURL(/\/en\/auth\/login\?status=reset-sent$/);
    await expect(page.getByRole("status")).toHaveText(
      "If the account exists, a reset link has been sent.",
    );
    await expectHealthyPage(page, runtime);
  });

  test("seeded learner can sign in and explicitly sign out", async ({ page }, testInfo) => {
    const runtime = observeRuntime(page);
    await signIn(page, SEEDED_USERS.learner);

    await expectVisibleAuthenticatedIdentity(
      page,
      SEEDED_USERS.learner.name,
      "Learner",
    );
    await expect(page.getByRole("heading", { name: "My learning" })).toBeVisible();
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);
    await captureSuccessfulScreenshot(page, testInfo, "auth/learner-session-desktop.png");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.goto(appUrl("/en/learn"));
    await expect(page).toHaveURL(/\/en\/auth\/login\?next=/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});
