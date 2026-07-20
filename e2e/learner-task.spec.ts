import { expect, test } from "./helpers/seeded-test";

import {
  appUrl,
  captureSuccessfulScreenshot,
  createSeededContext,
  expectAxeClean,
  expectHealthyPage,
  expectNoHorizontalOverflow,
  observeRuntime,
  useSeededSession,
  waitForFonts,
} from "./helpers/runtime";

const SEEDED_TASK_ID = "01980a26-0000-7000-8000-000000000001";
const VERIFIED_ANSWER =
  "E2E: partition valid and invalid credentials, then verify boundary and lockout behavior.";
const REVISION_FEEDBACK =
  "Add explicit lockout boundary cases and state the expected result for each partition.";
const REVISED_ANSWER =
  "E2E revision: cover valid, invalid, and locked credentials with explicit boundary inputs and expected outcomes.";
const EVIDENCE_TITLE = "E2E login boundary report";
const EVIDENCE_URL =
  "https://example.com/ditele/evidence/login-boundary-analysis";

test.describe("atomic learner task workflow", () => {
  test.describe.configure({ timeout: 90_000 });
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic learner attempt is mutated once in Chromium; cross-browser read-only coverage remains in the regression suite.",
  );

  test("learner submission, trainer revision, stale decision, and resubmission are atomic", async ({
    browser,
    context,
    page,
  }, testInfo) => {
    const runtime = observeRuntime(page);
    await useSeededSession(browser, context, "learner");
    await page.goto(appUrl(`/en/learn/tasks/${SEEDED_TASK_ID}`));

    await expect(
      page.getByRole("heading", { level: 1, name: "Analyze the login flow" }),
    ).toBeVisible();
    await waitForFonts(page);
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reveal hint" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Start with equivalence partitions and boundaries.",
      }),
    ).toBeVisible();

    await page.getByLabel("Evidence title").fill(EVIDENCE_TITLE);
    await page.getByLabel("Secure evidence URL").fill(EVIDENCE_URL);
    await page.getByRole("button", { name: "Add evidence" }).click();
    await expect(page.getByRole("link", { name: EVIDENCE_TITLE })).toHaveAttribute(
      "href",
      EVIDENCE_URL,
    );

    const writtenAnswer = page.getByLabel("Written answer");
    await writtenAnswer.fill(VERIFIED_ANSWER);
    await writtenAnswer.press("Tab");
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Analyze the login flow" }),
    ).toBeVisible();
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Written answer")).toHaveValue(VERIFIED_ANSWER);
    await expect(page.getByRole("link", { name: EVIDENCE_TITLE })).toHaveAttribute(
      "href",
      EVIDENCE_URL,
    );
    await waitForFonts(page);
    await expect(page.getByLabel("Boundary analysis")).toBeChecked();
    await expect(page.getByLabel("Random clicking")).not.toBeChecked();
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "learner/task-draft-desktop.png",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "learner/task-draft-mobile.png",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Written answer")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Analyze the login flow" }),
    ).toBeVisible();
    await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    await waitForFonts(page);
    await expect(page.getByLabel("Written answer")).toHaveValue(VERIFIED_ANSWER);
    await expect(page.getByLabel("Written answer")).toBeDisabled();
    await expect(page.getByRole("link", { name: EVIDENCE_TITLE })).toHaveAttribute(
      "href",
      EVIDENCE_URL,
    );
    await expectNoHorizontalOverflow(page);
    await expectAxeClean(page);
    await expectHealthyPage(page, runtime);

    const trainerContext = await createSeededContext(browser, "trainer");
    try {
      const trainerPage = await trainerContext.newPage();
      const trainerRuntime = observeRuntime(trainerPage);
      await trainerPage.goto(appUrl("/en/trainer/submissions"));
      await waitForFonts(trainerPage);

      const submissionRow = trainerPage
        .getByRole("row")
        .filter({ hasText: "Lena Learner" })
        .filter({ hasText: "Analyze the login flow" });
      await expect(submissionRow).toHaveCount(1);
      await submissionRow
        .getByRole("link", { name: "Open review" })
        .click();
      await expect(trainerPage).toHaveURL(
        /\/en\/trainer\/submissions\/[0-9a-f-]{36}$/i,
      );
      const submissionId = new URL(trainerPage.url()).pathname.split("/").at(-1);
      expect(submissionId).toMatch(/^[0-9a-f-]{36}$/i);

      await expect(
        trainerPage.getByRole("heading", { level: 1, name: "Review submission" }),
      ).toBeVisible();
      await expect(trainerPage.getByText(VERIFIED_ANSWER)).toBeVisible();
      await expect(trainerPage.getByText("1 hint used")).toBeVisible();
      await expect(trainerPage.getByLabel("Points / 10")).toBeVisible();
      await waitForFonts(trainerPage);
      await expectAxeClean(trainerPage);
      await captureSuccessfulScreenshot(
        trainerPage,
        testInfo,
        "trainer/review-desktop.png",
      );

      await trainerPage.goto(
        appUrl(`/de/trainer/submissions/${submissionId}`),
      );
      await expect(
        trainerPage.getByRole("heading", { level: 1, name: "Einreichung prüfen" }),
      ).toBeVisible();
      await expect(trainerPage.getByLabel("Punkte / 10")).toBeVisible();
      await waitForFonts(trainerPage);

      await trainerPage.setViewportSize({ width: 390, height: 844 });
      await trainerPage.goto(
        appUrl(`/ru/trainer/submissions/${submissionId}`),
      );
      await expect(
        trainerPage.getByRole("heading", { level: 1, name: "Проверка работы" }),
      ).toBeVisible();
      await expect(trainerPage.getByLabel("Баллы / 10")).toBeVisible();
      await waitForFonts(trainerPage);
      await expectNoHorizontalOverflow(trainerPage);
      await expectAxeClean(trainerPage);
      await captureSuccessfulScreenshot(
        trainerPage,
        testInfo,
        "trainer/review-ru-mobile.png",
      );

      await trainerPage.setViewportSize({ width: 1440, height: 1000 });
      await trainerPage.goto(
        appUrl(`/en/trainer/submissions/${submissionId}`),
      );
      await waitForFonts(trainerPage);
      const stalePage = await trainerContext.newPage();
      const staleRuntime = observeRuntime(stalePage);
      await stalePage.goto(
        appUrl(`/en/trainer/submissions/${submissionId}`),
      );
      await waitForFonts(stalePage);

      await trainerPage.getByLabel("Points / 10").fill("4");
      await trainerPage.getByLabel("Trainer feedback").fill(REVISION_FEEDBACK);
      await trainerPage
        .getByRole("button", { name: "Request revision" })
        .click();
      await expect(trainerPage).toHaveURL(/\/en\/trainer\/submissions\/?$/);
      await expect(
        trainerPage.getByRole("heading", {
          level: 1,
          name: "Submission queue",
        }),
      ).toBeVisible();

      await stalePage.getByLabel("Points / 10").fill("10");
      await stalePage
        .getByLabel("Trainer feedback")
        .fill("This stale decision must not be persisted.");
      await stalePage
        .getByRole("button", { name: "Accept submission" })
        .click();
      await expect(stalePage).toHaveURL(
        new RegExp(
          `/en/trainer/submissions/${submissionId}\\?notice=stale$`,
        ),
      );
      const staleAlert = stalePage.getByRole("alert").filter({
        hasText: "Your decision was not saved",
      });
      await expect(staleAlert).toContainText(
        "This submission changed after you opened it.",
      );
      await expect(
        stalePage.getByText("Revision required", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        stalePage.getByRole("button", { name: "Accept submission" }),
      ).toHaveCount(0);
      await captureSuccessfulScreenshot(
        stalePage,
        testInfo,
        "trainer/review-stale-conflict-desktop.png",
      );
      await expectHealthyPage(stalePage, staleRuntime);

      await page.reload();
      await expect(page.getByText("Revision required", { exact: true }).first()).toBeVisible();
      await waitForFonts(page);
      await expect(
        page.getByRole("heading", { name: "Trainer feedback" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Trainer feedback" }),
      ).toContainText(REVISION_FEEDBACK);
      await expect(page.getByLabel("Written answer")).toBeEnabled();
      await expect(page.getByRole("link", { name: EVIDENCE_TITLE })).toHaveAttribute(
        "href",
        EVIDENCE_URL,
      );
      await captureSuccessfulScreenshot(
        page,
        testInfo,
        "learner/task-revision-desktop.png",
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      await captureSuccessfulScreenshot(
        page,
        testInfo,
        "learner/task-revision-mobile.png",
      );
      await page.setViewportSize({ width: 1440, height: 1000 });

      await page.getByLabel("Written answer").fill(REVISED_ANSWER);
      await page.getByLabel("Written answer").press("Tab");
      await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Submit for review" }).click();
      await expect(page.getByText("Resubmitted", { exact: true }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.getByLabel("Written answer")).toBeDisabled();

      await trainerPage.reload();
      await waitForFonts(trainerPage);
      await expect(
        trainerPage
          .getByRole("row")
          .filter({ hasText: "Lena Learner" })
          .getByText("Resubmitted", { exact: true }),
      ).toBeVisible();
      await expectHealthyPage(trainerPage, trainerRuntime);
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      await expectHealthyPage(page, runtime);
    } finally {
      await trainerContext.close();
    }
  });
});
