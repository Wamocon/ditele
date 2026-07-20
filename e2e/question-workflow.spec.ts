import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./helpers/seeded-test";

import {
  appUrl,
  captureSuccessfulScreenshot,
  createSeededContext,
  expectAxeClean,
  expectHealthyPage,
  expectNoHorizontalOverflow,
  expectVisibleAuthenticatedIdentity,
  observeRuntime,
  useSeededSession,
  waitForFonts,
} from "./helpers/runtime";

const QUESTION_SUBJECT = "WF-03 E2E · Boundary clarification";
const QUESTION_BODY =
  "I partitioned valid and invalid credentials. How should lockout boundaries be represented without revealing the final answer?";
const TRAINER_ANSWER =
  "Keep the equivalence partitions, then add explicit values immediately before, at, and after the lockout boundary.";

function questionSummary(page: Page): Locator {
  return page
    .getByRole("heading", { level: 2, name: QUESTION_SUBJECT })
    .locator("..");
}

async function expectSingleQuestionSummary(page: Page): Promise<Locator> {
  await expect(
    page.getByRole("heading", { level: 2, name: QUESTION_SUBJECT }),
  ).toHaveCount(1);
  return questionSummary(page);
}

test.describe("WF-03 learner question workflow", () => {
  test.describe.configure({ timeout: 90_000 });
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The clean seeded question state is mutated once in Chromium; the remaining projects keep read-only question coverage.",
  );

  test("learner question, atomic trainer claim, answer, notification state, and archive remain consistent", async ({
    browser,
    context,
    page,
  }, testInfo) => {
    const learnerRuntime = observeRuntime(page);
    await useSeededSession(browser, context, "learner");
    await page.goto(appUrl("/en/learn/questions"));

    await expect(
      page.getByRole("heading", { level: 1, name: "Questions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No questions yet" }),
    ).toBeVisible();
    await expect(page.getByText(QUESTION_SUBJECT, { exact: true })).toHaveCount(0);

    await page
      .getByLabel("Task and group")
      .selectOption({ label: "Analyze the login flow — Release 0 Cohort" });
    await page.getByLabel("Subject").fill(QUESTION_SUBJECT);
    await page.getByLabel("Question", { exact: true }).fill(QUESTION_BODY);
    await page.getByRole("button", { name: "Send question" }).click();

    await expect(page).toHaveURL(
      /\/en\/learn\/questions\/[0-9a-f-]{36}$/i,
    );
    const questionId = new URL(page.url()).pathname.split("/").at(-1);
    expect(questionId).toMatch(/^[0-9a-f-]{36}$/i);
    await page.waitForLoadState("networkidle");
    await waitForFonts(page);

    await expect(
      page.getByRole("heading", { level: 1, name: QUESTION_SUBJECT }),
    ).toBeVisible();
    await expect(page.getByText("Open", { exact: true })).toBeVisible();
    await expect(page.getByText("Not assigned", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(QUESTION_BODY, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Analyze the login flow", { exact: true })).toBeVisible();
    await expect(page.getByText("Release 0 Cohort", { exact: true })).toBeVisible();
    await expectAxeClean(page);
    await captureSuccessfulScreenshot(
      page,
      testInfo,
      "learner/question-open-desktop.png",
    );

    await page.goto(appUrl("/en/learn/questions"));
    const learnerOpenSummary = await expectSingleQuestionSummary(page);
    await expect(learnerOpenSummary).toContainText("Open");
    await expect(learnerOpenSummary).toContainText("Not assigned");
    await expect(learnerOpenSummary).toContainText("Analyze the login flow");
    await expect(learnerOpenSummary).toContainText("Release 0 Cohort");

    const trainerContext = await createSeededContext(browser, "trainer");
    try {
      const trainerPage = await trainerContext.newPage();
      await trainerPage.setViewportSize({ width: 1440, height: 1000 });
      const trainerRuntime = observeRuntime(trainerPage);
      await trainerPage.goto(appUrl("/en/trainer/questions"));
      await waitForFonts(trainerPage);

      await expect(
        trainerPage.getByRole("heading", {
          level: 1,
          name: "Learner questions",
        }),
      ).toBeVisible();
      await expect(trainerPage.getByText("1 active question")).toBeVisible();
      const trainerOpenSummary = await expectSingleQuestionSummary(trainerPage);
      await expect(trainerOpenSummary).toContainText("Open");
      await expect(trainerOpenSummary).toContainText("Not assigned");
      await expect(trainerOpenSummary).toContainText("Analyze the login flow");
      await expect(trainerOpenSummary).toContainText("Release 0 Cohort");
      await captureSuccessfulScreenshot(
        trainerPage,
        testInfo,
        "trainer/question-queue-desktop.png",
      );

      await trainerOpenSummary
        .getByRole("link", { name: /Open question/ })
        .click();
      await expect(trainerPage).toHaveURL(
        new RegExp(`/en/trainer/questions/${questionId}$`),
      );
      await expect(
        trainerPage.getByRole("heading", { level: 1, name: QUESTION_SUBJECT }),
      ).toBeVisible();
      await expect(trainerPage.getByText("Lena Learner", { exact: true })).toBeVisible();
      await expect(trainerPage.getByText(QUESTION_BODY, { exact: true })).toHaveCount(1);
      await expect(
        trainerPage.getByRole("heading", { name: "Claim this question" }),
      ).toBeVisible();

      const stalePage = await trainerContext.newPage();
      const staleRuntime = observeRuntime(stalePage);
      await stalePage.goto(appUrl(`/en/trainer/questions/${questionId}`));
      await expect(
        stalePage.getByRole("button", { name: "Claim question" }),
      ).toBeVisible();

      await trainerPage.getByRole("button", { name: "Claim question" }).click();
      await expect(trainerPage).toHaveURL(
        new RegExp(`/en/trainer/questions/${questionId}\\?notice=claimed$`),
      );
      const claimedStatus = trainerPage.getByRole("status").filter({
        hasText: "Question claimed",
      });
      await expect(claimedStatus).toContainText(
        "You are now the assigned trainer. The current server state is shown below.",
      );
      await expect(trainerPage.getByText("Assigned", { exact: true })).toBeVisible();
      await expect(
        trainerPage.getByText("Theo Trainer", { exact: true }).last(),
      ).toBeVisible();
      await expect(
        trainerPage.getByRole("heading", { name: "Answer learner" }),
      ).toBeVisible();
      await expect(
        trainerPage.getByRole("button", { name: "Claim question" }),
      ).toHaveCount(0);
      await trainerPage.waitForLoadState("networkidle");
      await expectAxeClean(trainerPage);
      await captureSuccessfulScreenshot(
        trainerPage,
        testInfo,
        "trainer/question-claimed-desktop.png",
      );

      await stalePage.getByRole("button", { name: "Claim question" }).click();
      await expect(stalePage).toHaveURL(
        new RegExp(`/en/trainer/questions/${questionId}\\?notice=stale$`),
      );
      const conflictAlert = stalePage.getByRole("alert").filter({
        hasText: "Question changed",
      });
      await expect(conflictAlert).toContainText(
        "The question changed since it was loaded. Refresh before deciding.",
      );
      await stalePage.reload();
      await expect(stalePage.getByText("Assigned", { exact: true })).toBeVisible();
      await expect(
        stalePage.getByText("Theo Trainer", { exact: true }).last(),
      ).toBeVisible();
      await expect(
        stalePage.getByRole("button", { name: "Claim question" }),
      ).toHaveCount(0);
      await expectHealthyPage(stalePage, staleRuntime);

      await trainerPage.getByLabel("Answer", { exact: true }).fill(TRAINER_ANSWER);
      await trainerPage.getByRole("button", { name: "Send answer" }).click();
      await expect(trainerPage).toHaveURL(/\/en\/trainer\/questions\/archive$/);
      await trainerPage.waitForLoadState("networkidle");

      const trainerAnsweredSummary = await expectSingleQuestionSummary(trainerPage);
      await expect(trainerAnsweredSummary).toContainText("Answered");
      await expect(trainerAnsweredSummary).toContainText("Theo Trainer");
      await expect(trainerAnsweredSummary).toContainText("Analyze the login flow");
      await expect(trainerAnsweredSummary).toContainText("Release 0 Cohort");
      await captureSuccessfulScreenshot(
        trainerPage,
        testInfo,
        "trainer/question-answered-desktop.png",
      );

      await trainerAnsweredSummary
        .getByRole("link", { name: /Open question/ })
        .click();
      await expect(trainerPage.getByText("Answered", { exact: true })).toBeVisible();
      await expect(trainerPage.getByText(TRAINER_ANSWER, { exact: true })).toHaveCount(1);
      await expect(
        trainerPage.getByRole("heading", { name: "No action required" }),
      ).toBeVisible();
      await expect(
        trainerPage.getByRole("button", { name: /Claim question|Send answer/ }),
      ).toHaveCount(0);

      await trainerPage.setViewportSize({ width: 390, height: 844 });
      await expectVisibleAuthenticatedIdentity(
        trainerPage,
        "Theo Trainer",
        "Trainer",
      );
      await expectNoHorizontalOverflow(trainerPage);
      await expectAxeClean(trainerPage);
      await captureSuccessfulScreenshot(
        trainerPage,
        testInfo,
        "trainer/question-answered-mobile.png",
      );
      await trainerPage.setViewportSize({ width: 1440, height: 1000 });

      await trainerPage.goto(appUrl("/en/trainer/questions"));
      await expect(
        trainerPage.getByRole("heading", { name: QUESTION_SUBJECT }),
      ).toHaveCount(0);
      await expect(
        trainerPage.getByRole("heading", { name: "No active questions" }),
      ).toBeVisible();

      await page.goto(appUrl(`/en/learn/questions/${questionId}`));
      await expect(page.getByText("Answered", { exact: true })).toBeVisible();
      await expect(page.getByText("Theo Trainer", { exact: true })).toBeVisible();
      await expect(page.getByText(TRAINER_ANSWER, { exact: true })).toHaveCount(1);
      await expect(page.getByText(QUESTION_BODY, { exact: true })).toHaveCount(1);
      await waitForFonts(page);
      await expectAxeClean(page);
      await captureSuccessfulScreenshot(
        page,
        testInfo,
        "learner/question-answered-desktop.png",
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await expectVisibleAuthenticatedIdentity(page, "Lena Learner", "Learner");
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      await captureSuccessfulScreenshot(
        page,
        testInfo,
        "learner/question-answered-mobile.png",
      );

      await page.getByRole("button", { name: "Archive question" }).click();
      await expect(page).toHaveURL(/\/en\/learn\/questions$/);
      await page.waitForLoadState("networkidle");
      const learnerArchivedSummary = await expectSingleQuestionSummary(page);
      await expect(learnerArchivedSummary).toContainText("Archived");
      await expect(learnerArchivedSummary).toContainText("Theo Trainer");
      await expect(learnerArchivedSummary).toContainText("Analyze the login flow");
      await expect(learnerArchivedSummary).toContainText("Release 0 Cohort");

      await learnerArchivedSummary
        .getByRole("link", { name: /Open question/ })
        .click();
      await expect(page.getByText("Archived", { exact: true })).toBeVisible();
      await expect(page.getByText(TRAINER_ANSWER, { exact: true })).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Archive question" }),
      ).toHaveCount(0);

      await trainerPage.goto(appUrl("/en/trainer/questions/archive"));
      const trainerArchivedSummary = await expectSingleQuestionSummary(trainerPage);
      await expect(trainerArchivedSummary).toContainText("Archived");
      await expect(trainerArchivedSummary).toContainText("Theo Trainer");
      await expect(trainerArchivedSummary).toContainText("Analyze the login flow");
      await expect(trainerArchivedSummary).toContainText("Release 0 Cohort");

      await expectHealthyPage(trainerPage, trainerRuntime);
      await expectHealthyPage(page, learnerRuntime);
    } finally {
      await trainerContext.close();
    }
  });
});
