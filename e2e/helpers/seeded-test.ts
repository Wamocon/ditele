import { expect, test as base } from "@playwright/test";

import { acquireSeededAuthLease } from "./runtime";

export const test = base.extend<{ seededAuthLease: void }>({
  seededAuthLease: [
    async ({}, runTest) => {
      const release = await acquireSeededAuthLease();
      try {
        await runTest();
      } finally {
        await release();
      }
    },
    { auto: true, timeout: 240_000 },
  ],
});

export { expect };
