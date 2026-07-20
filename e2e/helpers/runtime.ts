import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const APP_BASE_URL =
  process.env.DITELE_E2E_BASE_URL ?? "http://127.0.0.1:3100";

export const SEEDED_PASSWORD = "123123123";

export const SEEDED_USERS = {
  learner: { email: "learner@ditele.local", name: "Lena Learner" },
  trainer: { email: "trainer@ditele.local", name: "Theo Trainer" },
  admin: { email: "admin@ditele.local", name: "Ada Admin" },
  organizationAdmin: {
    email: "org-admin@ditele.local",
    name: "Olivia Organization Admin",
  },
} as const;

export type SeededRole =
  | "learner"
  | "trainer"
  | "admin"
  | "organizationAdmin";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const SEEDED_ROLE_DESTINATIONS: Record<SeededRole, string> = {
  learner: "/en/learn",
  trainer: "/en/trainer",
  admin: "/en/admin",
  organizationAdmin: "/en/organization",
};

const sessionPromises = new Map<SeededRole, Promise<StorageState>>();

function hasRunScopedSessionCache(): boolean {
  return Boolean(process.env.DITELE_E2E_RUN_ID);
}

function sessionCachePaths(role: SeededRole) {
  const runId = process.env.DITELE_E2E_RUN_ID ?? "standalone";
  const serverKey = createHash("sha256")
    .update(`${APP_BASE_URL}:${runId}`)
    .digest("hex")
    .slice(0, 12);
  const directory = join(tmpdir(), `ditele-e2e-sessions-${serverKey}`);
  return {
    directory,
    lock: join(directory, `${role}.lock`),
    state: join(directory, `${role}.json`),
  };
}

function isStorageState(value: unknown): value is StorageState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { cookies?: unknown; origins?: unknown };
  return Array.isArray(candidate.cookies) && Array.isArray(candidate.origins);
}

async function readCachedStorageState(path: string): Promise<StorageState | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isStorageState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function cachedStorageStateCanBeReused(
  browser: Browser,
  role: SeededRole,
  storageState: StorageState,
): Promise<boolean> {
  // Playwright assigns a unique run ID in its config, so a state in this
  // directory was created after the current run started. Re-validating it in
  // every worker adds real password logins after any transient route check and
  // can incorrectly exhaust the production throttle. Standalone callers keep
  // the defensive live validation because their cache can span runs/resets.
  return hasRunScopedSessionCache() ||
    storageStateIsCurrent(browser, role, storageState);
}

async function storageStateIsCurrent(
  browser: Browser,
  role: SeededRole,
  storageState: StorageState,
): Promise<boolean> {
  const context = await browser.newContext({ storageState });
  try {
    const page = await context.newPage();
    await page.goto(appUrl(SEEDED_ROLE_DESTINATIONS[role]), {
      waitUntil: "domcontentloaded",
    });
    return (
      new URL(page.url()).pathname === SEEDED_ROLE_DESTINATIONS[role] &&
      (await page
        .locator(".app-shell__profile")
        .getByText(SEEDED_USERS[role].name, { exact: true })
        .isVisible())
    );
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

async function createStorageState(
  browser: Browser,
  role: SeededRole,
): Promise<StorageState> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(
      page,
      SEEDED_USERS[role],
      SEEDED_ROLE_DESTINATIONS[role],
    );
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function rebuildCachedStorageState(
  browser: Browser,
  role: SeededRole,
): Promise<StorageState> {
  const paths = sessionCachePaths(role);
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    let lockHandle;
    try {
      lockHandle = await open(paths.lock, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lockAge = Date.now() - (await stat(paths.lock)).mtimeMs;
        if (lockAge > 60_000) {
          await unlink(paths.lock);
          continue;
        }
      } catch {
        continue;
      }
      const cached = await readCachedStorageState(paths.state);
      if (
        cached &&
        (await cachedStorageStateCanBeReused(browser, role, cached))
      ) {
        return cached;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
      continue;
    }

    try {
      const cached = await readCachedStorageState(paths.state);
      if (
        cached &&
        (await cachedStorageStateCanBeReused(browser, role, cached))
      ) {
        return cached;
      }

      await unlink(paths.state).catch(() => undefined);
      const fresh = await createStorageState(browser, role);
      const temporaryPath = `${paths.state}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(fresh), {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, paths.state);
      return fresh;
    } finally {
      await lockHandle.close();
      await unlink(paths.lock).catch(() => undefined);
    }
  }

  throw new Error(`Timed out preparing the seeded ${role} browser session.`);
}

async function getSeededStorageState(
  browser: Browser,
  role: SeededRole,
): Promise<StorageState> {
  const existing = sessionPromises.get(role);
  if (existing) {
    return existing;
  }

  const statePromise = (async () => {
    const cached = await readCachedStorageState(sessionCachePaths(role).state);
    if (
      cached &&
      (await cachedStorageStateCanBeReused(browser, role, cached))
    ) {
      return cached;
    }
    return rebuildCachedStorageState(browser, role);
  })();
  sessionPromises.set(role, statePromise);
  try {
    return await statePromise;
  } catch (error) {
    sessionPromises.delete(role);
    throw error;
  }
}

export async function acquireSeededAuthLease(): Promise<() => Promise<void>> {
  const paths = sessionCachePaths("learner");
  const lockPath = join(paths.directory, "shared-seeded-auth.lock");
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      return async () => {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lockAge = Date.now() - (await stat(lockPath)).mtimeMs;
        if (lockAge > 60_000) {
          await unlink(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
  }

  throw new Error("Timed out waiting for the shared seeded-auth test lease.");
}

export async function useSeededSession(
  browser: Browser,
  context: BrowserContext,
  role: SeededRole,
): Promise<void> {
  const state = await getSeededStorageState(browser, role);
  await context.addCookies(state.cookies);
  await context.addInitScript((origins) => {
    const currentOrigin = origins.find((item) => item.origin === window.location.origin);
    for (const entry of currentOrigin?.localStorage ?? []) {
      window.localStorage.setItem(entry.name, entry.value);
    }
  }, state.origins);
}

export async function createSeededContext(
  browser: Browser,
  role: SeededRole,
): Promise<BrowserContext> {
  return browser.newContext({
    storageState: await getSeededStorageState(browser, role),
  });
}

export function appUrl(pathname: string): string {
  return new URL(pathname, APP_BASE_URL).toString();
}

export async function expectVisibleAuthenticatedIdentity(
  page: Page,
  userName: string,
  localizedRole: string,
): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY;
  if (viewportWidth <= 720) {
    await expect(
      page.getByRole("group", { name: `${userName}, ${localizedRole}` }),
    ).toBeVisible();
    return;
  }

  await expect(
    page
      .locator(".app-shell__profile")
      .getByText(userName, { exact: true }),
  ).toBeVisible();
}

type RuntimeObservation = {
  consoleProblems: string[];
  failedRequests: string[];
  failedResponses: string[];
  pageErrors: string[];
};

type NextTransportAbort = {
  errorText: string | undefined;
  headers: Record<string, string>;
  method: string;
  receivedCompletedServerActionResponse: boolean;
  resourceType: string;
  url: string;
};

export function isExpectedNextTransportAbort(
  abort: NextTransportAbort,
  appOrigin = new URL(APP_BASE_URL).origin,
): boolean {
  if (abort.errorText !== "net::ERR_ABORTED") return false;

  let requestUrl: URL;
  try {
    requestUrl = new URL(abort.url);
  } catch {
    return false;
  }

  if (requestUrl.origin !== appOrigin) return false;

  // Chromium can cancel the development-only font request when a server
  // redirect supersedes the current document. This preserves the existing,
  // deliberately path-scoped exception.
  if (requestUrl.pathname.startsWith("/__nextjs_font/")) return true;

  if (abort.resourceType !== "fetch") return false;

  if (abort.method === "GET") {
    return (
      Boolean(requestUrl.searchParams.get("_rsc")) &&
      abort.headers.rsc === "1"
    );
  }

  if (abort.method === "POST") {
    return (
      abort.receivedCompletedServerActionResponse &&
      Boolean(abort.headers["next-action"]?.trim()) &&
      abort.headers.accept
        ?.toLowerCase()
        .split(",")
        .some((value) => value.trim().startsWith("text/x-component")) === true
    );
  }

  return false;
}

export function isCompletedNextServerActionResponse(
  status: number,
  headers: Record<string, string>,
): boolean {
  // Next emits these headers only after it has processed the action. Chromium
  // may then abort the superseded RSC stream while the committed mutation or
  // redirect remains authoritative.
  const isReactServerComponent =
    headers["content-type"]
      ?.toLowerCase()
      .split(";", 1)[0]
      ?.trim() === "text/x-component";

  if (!isReactServerComponent) return false;

  return (
    (status === 303 && Boolean(headers["x-action-redirect"]?.trim())) ||
    (status === 200 && headers["x-action-revalidated"] === "1")
  );
}

export function observeRuntime(page: Page): RuntimeObservation {
  const observation: RuntimeObservation = {
    consoleProblems: [],
    failedRequests: [],
    failedResponses: [],
    pageErrors: [],
  };
  const completedServerActionResponses = new WeakSet<Request>();

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      observation.consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => observation.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText;
    if (
      isExpectedNextTransportAbort({
        errorText: failure,
        headers: request.headers(),
        method: request.method(),
        receivedCompletedServerActionResponse:
          completedServerActionResponses.has(request),
        resourceType: request.resourceType(),
        url: request.url(),
      })
    ) {
      return;
    }
    observation.failedRequests.push(
      `${request.method()} ${request.url()} — ${failure ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (
      isCompletedNextServerActionResponse(
        response.status(),
        response.headers(),
      )
    ) {
      completedServerActionResponses.add(response.request());
    }
    if (response.status() >= 400) {
      observation.failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return observation;
}

export async function expectHealthyPage(
  page: Page,
  observation: RuntimeObservation,
): Promise<void> {
  await expect(page).toHaveTitle(/\S+/);
  await expect(page.locator("body")).toContainText(/\S{20,}/);
  const overlayText = await page.evaluate(() =>
    [...document.querySelectorAll("nextjs-portal")]
      .map((portal) => portal.shadowRoot?.textContent ?? "")
      .join(" "),
  );
  expect(overlayText, "Next.js error overlay content").not.toMatch(
    /application error|build error|unhandled runtime error/i,
  );
  expect(observation.consoleProblems, "browser console errors or warnings").toEqual([]);
  expect(observation.pageErrors, "uncaught browser page errors").toEqual([]);
  expect(observation.failedRequests, "failed browser requests").toEqual([]);
  expect(observation.failedResponses, "HTTP responses with status >= 400").toEqual([]);
}

export async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, "WCAG violations reported by axe").toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const className =
          typeof element.className === "string"
            ? element.className
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((name) => `.${name}`)
                .join("")
            : "";
        return {
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${className}`,
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        };
      })
      .filter(
        (item) =>
          item.left < -0.5 ||
          item.right > clientWidth + 0.5 ||
          item.width > clientWidth + 0.5,
      )
      .sort((left, right) => right.right - left.right)
      .slice(0, 20);

    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });
  expect(
    result.scrollWidth,
    `Horizontal overflow offenders: ${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.clientWidth);
}

export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function signIn(
  page: Page,
  user: { email: string },
  nextPath = "/en/learn",
): Promise<void> {
  await page.goto(
    appUrl(`/en/auth/login?next=${encodeURIComponent(nextPath)}`),
  );
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(new RegExp(`${nextPath.replaceAll("/", "\\/")}/?$`));
}

export async function captureSuccessfulScreenshot(
  page: Page,
  testInfo: TestInfo,
  relativePath: string,
): Promise<void> {
  if (testInfo.project.name !== "chromium") return;
  const target = resolve("artifacts/screenshots", relativePath);
  await mkdir(dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
}
