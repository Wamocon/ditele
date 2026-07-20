import { expect, test } from "./helpers/seeded-test";

import {
  appUrl,
  expectHealthyPage,
  observeRuntime,
  type SeededRole,
  useSeededSession,
} from "./helpers/runtime";

const ids = {
  course: "01980a20-0000-7000-8000-000000000001",
  cohort: "01980a30-0000-7000-8000-000000000001",
  learner: "01980a00-0000-7000-8000-000000000001",
  task: "01980a26-0000-7000-8000-000000000001",
  version: "01980a22-0000-7000-8000-000000000001",
} as const;

const routeMatrix: ReadonlyArray<{
  readonly role: SeededRole;
  readonly paths: readonly string[];
}> = [
  {
    role: "learner",
    paths: [
      "/en/learn",
      "/en/learn/certificates",
      `/en/learn/courses/${ids.course}`,
      `/en/learn/enroll/${ids.course}`,
      "/en/learn/history",
      "/en/learn/notifications",
      "/en/learn/portfolio",
      "/en/learn/profile",
      "/en/learn/questions",
      "/en/learn/skills",
      `/en/learn/tasks/${ids.task}`,
    ],
  },
  {
    role: "trainer",
    paths: [
      "/en/trainer",
      "/en/trainer/groups",
      `/en/trainer/groups/${ids.cohort}`,
      "/en/trainer/history",
      "/en/trainer/progress",
      "/en/trainer/questions",
      "/en/trainer/questions/archive",
      "/en/trainer/submissions",
    ],
  },
  {
    role: "admin",
    paths: [
      "/en/admin",
      "/en/admin/applications",
      "/en/admin/courses",
      `/en/admin/courses/${ids.course}`,
      `/en/admin/courses/${ids.course}/versions/${ids.version}`,
      `/en/admin/courses/${ids.course}/versions/${ids.version}/preview?role=learner`,
      "/en/admin/groups",
      `/en/admin/groups/${ids.cohort}`,
      "/en/admin/settings",
      "/en/admin/tasks",
      "/en/admin/users",
      `/en/admin/users/${ids.learner}`,
    ],
  },
  {
    role: "organizationAdmin",
    paths: ["/en/organization"],
  },
];

test.describe("non-mutating seeded-role route smoke", () => {
  for (const scenario of routeMatrix) {
    test(`${scenario.role} routes render meaningful healthy content`, async ({
      browser,
      context,
    }) => {
      await useSeededSession(browser, context, scenario.role);

      for (const path of scenario.paths) {
        await test.step(path, async () => {
          const routePage = await context.newPage();
          try {
            const runtime = observeRuntime(routePage);
            const response = await routePage.goto(appUrl(path));
            expect(response?.status(), `${path} document response`).toBeLessThan(400);
            await expect(routePage).toHaveURL(appUrl(path));
            await expect(
              routePage.locator("main").getByRole("heading").first(),
              `${path} primary heading`,
            ).toBeVisible();
            await expect(
              routePage.getByRole("heading", {
                name: /something went wrong|you do not have access|page not found/i,
              }),
              `${path} known error surface`,
            ).toHaveCount(0);
            await expectHealthyPage(routePage, runtime);
          } finally {
            await routePage.close();
          }
        });
      }
    });
  }
});
