import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import { chromium, Page, Request, Response } from 'playwright';

type PageKey = 'login' | 'home' | 'grades' | 'attendance' | 'schedule' | 'assignments';
type CaptureStatus = 'loaded' | 'failed' | 'skipped';
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface DiscoveryConfig {
  baseUrl: string;
  username: string;
  password: string;
  loginPagePath?: string;
  postLoginTimeoutMs: number;
  headless: boolean;
  outputDir: string;
}

interface PageTarget {
  key: Exclude<PageKey, 'login'>;
  label: string;
  candidateSlugs: string[];
  navMatchers: RegExp[];
}

interface PageCapture {
  key: PageKey;
  label: string;
  requestedUrl?: string;
  finalUrl: string;
  title: string;
  htmlPath: string;
  status: CaptureStatus;
  httpStatus?: number;
  error?: string;
  studentHints: StudentHint[];
  discoveredLinks: NavigationLink[];
  capturedAt: string;
}

interface NetworkEntry {
  id: number;
  pageKey: PageKey;
  resourceType: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestPostData?: string;
  startedAt: string;
  finishedAt?: string;
  status?: number;
  ok?: boolean;
  responseHeaders?: Record<string, string>;
  responseContentType?: string;
  responseBodyText?: string;
  responseBodyBase64?: string;
  bodyEncoding?: 'utf8' | 'base64';
  error?: string;
}

interface StudentHint {
  source: 'dom' | 'network';
  pageKey?: PageKey;
  endpointUrl?: string;
  displayName?: string;
  studentId?: string;
  personId?: string;
  studentNumber?: string;
  gradeLevel?: string;
  location?: string;
  selectorHint?: string;
  raw?: JsonValue | string;
}

interface NavigationLink {
  label: string;
  href?: string;
  text: string;
}

interface DiscoverySummary {
  startedAt: string;
  finishedAt: string;
  headless: boolean;
  baseUrl: string;
  loginUrl: string;
  outputDir: string;
  pages: PageCapture[];
  loadedPages: string[];
  failedPages: string[];
  uniqueEndpoints: string[];
  endpointCount: number;
  totalRequests: number;
  studentCount: number;
}

const DEFAULT_POST_LOGIN_TIMEOUT_MS = 3 * 60 * 1000;
const PAGE_TARGETS: PageTarget[] = [
  {
    key: 'home',
    label: 'Home / Dashboard',
    candidateSlugs: ['', 'home', 'summary', 'dashboard'],
    navMatchers: [/\bhome\b/i, /\bdashboard\b/i, /\bsummary\b/i],
  },
  {
    key: 'grades',
    label: 'Grades',
    candidateSlugs: ['grades', 'instruction/grades'],
    navMatchers: [/\bgrades\b/i, /\bgrade book\b/i],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    candidateSlugs: ['attendance', 'instruction/attendance'],
    navMatchers: [/\battendance\b/i],
  },
  {
    key: 'schedule',
    label: 'Schedule',
    candidateSlugs: ['schedule', 'instruction/schedule'],
    navMatchers: [/\bschedule\b/i, /\bcalendar\b/i],
  },
  {
    key: 'assignments',
    label: 'Assignments',
    candidateSlugs: ['assignments', 'instruction/assignments'],
    navMatchers: [/\bassignments\b/i, /\bto do\b/i],
  },
];

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const config = loadConfig();
  await resetOutputDir(config.outputDir);

  const networkEntries: NetworkEntry[] = [];
  const pageCaptures: PageCapture[] = [];
  const pendingNetworkTasks = new Set<Promise<void>>();
  let activePageKey: PageKey = 'login';
  let requestCounter = 0;

  const browser = await chromium.launch({ headless: config.headless, slowMo: config.headless ? 0 : 100 });

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    const trackTask = (task: Promise<void>): void => {
      pendingNetworkTasks.add(task);
      void task.finally(() => pendingNetworkTasks.delete(task));
    };

    page.on('request', (request) => {
      const entry: NetworkEntry = {
        id: ++requestCounter,
        pageKey: activePageKey,
        resourceType: request.resourceType(),
        url: request.url(),
        method: request.method(),
        requestHeaders: request.headers(),
        requestPostData: request.postData() ?? undefined,
        startedAt: new Date().toISOString(),
      };

      networkEntries.push(entry);
    });

    page.on('response', (response) => {
      const task = captureResponseDetails(networkEntries, response).catch((error: unknown) => {
        const entry = findOrCreateNetworkEntry(networkEntries, response.request(), activePageKey);
        entry.error = toErrorMessage(error);
        entry.finishedAt = new Date().toISOString();
      });
      trackTask(task);
    });

    page.on('requestfailed', (request) => {
      const entry = findOrCreateNetworkEntry(networkEntries, request, activePageKey);
      entry.error = request.failure()?.errorText ?? 'Request failed.';
      entry.finishedAt = new Date().toISOString();
    });

    const loginUrl = buildLoginUrl(config);
    console.log(`Opening Infinite Campus at ${loginUrl}`);

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await settlePage(page);
    pageCaptures.push(await capturePageArtifacts(page, 'login', 'Login', config.outputDir, loginUrl, 'loaded'));

    const loginResult = await attemptLogin(page, config, loginUrl);
    if (!loginResult.success) {
      console.warn(`Login did not complete cleanly: ${loginResult.message}`);
    }

    const discoveredLinks = new Map<Exclude<PageKey, 'login'>, Set<string>>();

    for (const target of PAGE_TARGETS) {
      activePageKey = target.key;
      const pageCapture = await navigateAndCapturePage(page, target, config, discoveredLinks);
      pageCaptures.push(pageCapture);

      for (const link of pageCapture.discoveredLinks) {
        for (const matcher of target.navMatchers) {
          if (matcher.test(link.text) && link.href) {
            addDiscoveredLink(discoveredLinks, target.key, link.href);
          }
        }
      }

      for (const [pageKey, urls] of classifyLinksByTarget(pageCapture.discoveredLinks)) {
        for (const url of urls) {
          addDiscoveredLink(discoveredLinks, pageKey, url);
        }
      }
    }

    await waitForPendingTasks(pendingNetworkTasks);

    const networkStudents = extractStudentsFromNetwork(networkEntries);
    const domStudents = pageCaptures.flatMap((capture) => capture.studentHints.map((hint) => ({ ...hint, pageKey: capture.key })));
    const students = dedupeStudents([...domStudents, ...networkStudents]);
    const uniqueEndpoints = summarizeEndpoints(networkEntries);

    const summary: DiscoverySummary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      headless: config.headless,
      baseUrl: config.baseUrl,
      loginUrl,
      outputDir: config.outputDir,
      pages: pageCaptures,
      loadedPages: pageCaptures.filter((pageCapture) => pageCapture.status === 'loaded').map((pageCapture) => pageCapture.key),
      failedPages: pageCaptures.filter((pageCapture) => pageCapture.status === 'failed').map((pageCapture) => pageCapture.key),
      uniqueEndpoints,
      endpointCount: uniqueEndpoints.length,
      totalRequests: networkEntries.length,
      studentCount: students.length,
    };

    await writeJson(path.join(config.outputDir, 'network-log.json'), networkEntries);
    await writeJson(path.join(config.outputDir, 'students.json'), {
      detectedStudents: students,
      domHints: domStudents,
      networkHints: networkStudents,
    });
    await writeJson(path.join(config.outputDir, 'summary.json'), summary);

    console.log('Infinite Campus discovery summary');
    console.log(`- Pages loaded: ${summary.loadedPages.join(', ') || 'none'}`);
    console.log(`- Pages failed: ${summary.failedPages.join(', ') || 'none'}`);
    console.log(`- Unique endpoints found: ${summary.endpointCount}`);
    console.log(`- Students detected: ${summary.studentCount}`);
    console.log(`- Captures saved to: ${config.outputDir}`);
  } finally {
    await browser.close();
  }
}

function loadConfig(): DiscoveryConfig {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    printHelp();
    process.exit(0);
  }

  loadEnv({ path: path.join(process.cwd(), '.env'), quiet: true });

  const baseUrl = process.env.IC_BASE_URL?.trim();
  const username = process.env.IC_USERNAME?.trim();
  const password = process.env.IC_PASSWORD?.trim();

  if (!baseUrl || !username || !password) {
    throw new Error('Missing Infinite Campus credentials. Set IC_BASE_URL, IC_USERNAME, and IC_PASSWORD in .env.');
  }

  return {
    baseUrl: stripTrailingSlash(baseUrl),
    username,
    password,
    loginPagePath: process.env.IC_LOGIN_PAGE_PATH?.trim(),
    postLoginTimeoutMs: parsePositiveNumber(process.env.IC_DISCOVERY_POST_LOGIN_TIMEOUT_MS) ?? DEFAULT_POST_LOGIN_TIMEOUT_MS,
    headless: args.has('--headless'),
    outputDir: path.join(process.cwd(), 'scripts', 'ic-captures'),
  };
}

function printHelp(): void {
  console.log('Usage: npm run ic:discover -- [--headless]');
  console.log('Loads Infinite Campus credentials from .env and writes captures to scripts/ic-captures/.');
}

async function resetOutputDir(outputDir: string): Promise<void> {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, 'pages'), { recursive: true });
}

function buildLoginUrl(config: DiscoveryConfig): string {
  if (!config.loginPagePath) {
    return config.baseUrl;
  }

  return buildAbsoluteUrl(config.baseUrl, config.loginPagePath);
}

async function attemptLogin(
  page: Page,
  config: DiscoveryConfig,
  loginUrl: string,
): Promise<{ success: boolean; message: string }> {
  const usernameInput = await findVisibleLocator(page, [
    'input[name="username"]',
    'input[name*="user" i]',
    'input[id*="user" i]',
    'input[autocomplete="username"]',
    'input[type="email"]',
    'input[type="text"]',
  ]);
  const passwordInput = await findVisibleLocator(page, [
    'input[name="password"]',
    'input[name*="pass" i]',
    'input[id*="pass" i]',
    'input[autocomplete="current-password"]',
    'input[type="password"]',
  ]);

  if (!usernameInput || !passwordInput) {
    return waitForPostLogin(page, loginUrl, config.postLoginTimeoutMs, 'Login form not found — waiting for manual portal navigation.');
  }

  await usernameInput.fill(config.username);
  await passwordInput.fill(config.password);

  const submitButton = await findVisibleLocator(page, [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Log In")',
    'button:has-text("Sign In")',
    'button:has-text("Login")',
  ]);

  if (submitButton) {
    await submitButton.click();
  } else {
    await passwordInput.press('Enter');
  }

  return waitForPostLogin(page, loginUrl, config.postLoginTimeoutMs, 'Timed out waiting for the portal to finish login or MFA.');
}

async function waitForPostLogin(
  page: Page,
  loginUrl: string,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<{ success: boolean; message: string }> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await settlePage(page);

    const hasPasswordField = await page.locator('input[type="password"]').count();
    const currentUrl = page.url();
    const bodyText = await safeBodyText(page);
    const looksAuthenticated =
      (!currentUrl.startsWith(loginUrl) && hasPasswordField === 0) ||
      /logout|sign out|schedule|attendance|grades/i.test(bodyText);

    if (looksAuthenticated) {
      return { success: true, message: 'Login succeeded.' };
    }

    await page.waitForTimeout(1_000);
  }

  return { success: false, message: timeoutMessage };
}

async function navigateAndCapturePage(
  page: Page,
  target: PageTarget,
  config: DiscoveryConfig,
  discoveredLinks: Map<Exclude<PageKey, 'login'>, Set<string>>,
): Promise<PageCapture> {
  const attemptedUrls: string[] = [];

  try {
    const clicked = await clickNavigation(page, target);
    if (!clicked) {
      const candidates = buildPageCandidateUrls(config.baseUrl, target.candidateSlugs, discoveredLinks.get(target.key));
      for (const candidate of candidates) {
        attemptedUrls.push(candidate);
        const response = await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await settlePage(page);

        if (!response || response.status() < 400) {
          return capturePageArtifacts(page, target.key, target.label, config.outputDir, candidate, 'loaded', response?.status());
        }
      }
    } else {
      return capturePageArtifacts(page, target.key, target.label, config.outputDir, page.url(), 'loaded');
    }
  } catch (error: unknown) {
    return capturePageArtifacts(page, target.key, target.label, config.outputDir, attemptedUrls[attemptedUrls.length - 1], 'failed', undefined, toErrorMessage(error));
  }

  return capturePageArtifacts(
    page,
    target.key,
    target.label,
    config.outputDir,
    attemptedUrls[attemptedUrls.length - 1],
    'failed',
    undefined,
    'No working navigation path was found for this page.',
  );
}

async function clickNavigation(page: Page, target: PageTarget): Promise<boolean> {
  for (const matcher of target.navMatchers) {
    const link = page.getByRole('link', { name: matcher }).first();
    if (await isVisible(link)) {
      await link.click();
      await settlePage(page);
      return true;
    }

    const button = page.getByRole('button', { name: matcher }).first();
    if (await isVisible(button)) {
      await button.click();
      await settlePage(page);
      return true;
    }
  }

  return false;
}

async function capturePageArtifacts(
  page: Page,
  key: PageKey,
  label: string,
  outputDir: string,
  requestedUrl: string | undefined,
  status: CaptureStatus,
  httpStatus?: number,
  error?: string,
): Promise<PageCapture> {
  const html = await page.content();
  const title = await page.title().catch(() => '');
  const htmlPath = path.join(outputDir, 'pages', `${key}.html`);
  await fs.writeFile(htmlPath, html, 'utf8');

  const studentHints = await extractStudentHintsFromDom(page, key);
  const discoveredLinks = await extractNavigationLinks(page);

  const capture: PageCapture = {
    key,
    label,
    requestedUrl,
    finalUrl: page.url(),
    title,
    htmlPath,
    status,
    httpStatus,
    error,
    studentHints,
    discoveredLinks,
    capturedAt: new Date().toISOString(),
  };

  await writeJson(path.join(outputDir, 'pages', `${key}.json`), capture);
  return capture;
}

async function captureResponseDetails(entries: NetworkEntry[], response: Response): Promise<void> {
  const request = response.request();
  const entry = findOrCreateNetworkEntry(entries, request, 'login');
  entry.status = response.status();
  entry.ok = response.ok();
  entry.responseHeaders = response.headers();
  entry.responseContentType = entry.responseHeaders['content-type'];
  entry.finishedAt = new Date().toISOString();

  const resourceType = request.resourceType();
  const contentType = entry.responseContentType?.toLowerCase() ?? '';
  const shouldReadTextBody = ['xhr', 'fetch', 'document'].includes(resourceType) || /json|text|html|xml|javascript/.test(contentType);

  if (!shouldReadTextBody) {
    return;
  }

  try {
    const body = await response.body();
    if (looksTextual(body, contentType)) {
      entry.responseBodyText = body.toString('utf8');
      entry.bodyEncoding = 'utf8';
    } else {
      entry.responseBodyBase64 = body.toString('base64');
      entry.bodyEncoding = 'base64';
    }
  } catch (error: unknown) {
    entry.error = entry.error ?? `Response body unavailable: ${toErrorMessage(error)}`;
  }
}

function findOrCreateNetworkEntry(entries: NetworkEntry[], request: Request, pageKey: PageKey): NetworkEntry {
  const existing = [...entries].reverse().find((entry) => entry.url === request.url() && entry.method === request.method() && !entry.finishedAt);
  if (existing) {
    return existing;
  }

  const created: NetworkEntry = {
    id: entries.length + 1,
    pageKey,
    resourceType: request.resourceType(),
    url: request.url(),
    method: request.method(),
    requestHeaders: request.headers(),
    requestPostData: request.postData() ?? undefined,
    startedAt: new Date().toISOString(),
  };

  entries.push(created);
  return created;
}

async function findVisibleLocator(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await isVisible(locator)) {
      return locator;
    }
  }

  return null;
}

async function isVisible(locator: ReturnType<Page['locator']>): Promise<boolean> {
  try {
    return await locator.isVisible({ timeout: 1_000 });
  } catch {
    return false;
  }
}

async function settlePage(page: Page): Promise<void> {
  await Promise.allSettled([
    page.waitForLoadState('domcontentloaded', { timeout: 10_000 }),
    page.waitForLoadState('networkidle', { timeout: 10_000 }),
  ]);
  await page.waitForTimeout(750);
}

async function safeBodyText(page: Page): Promise<string> {
  try {
    return (await page.locator('body').innerText()).slice(0, 2_000);
  } catch {
    return '';
  }
}

async function extractStudentHintsFromDom(page: Page, pageKey: PageKey): Promise<StudentHint[]> {
  const rawHints = (await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll(
        '[data-student-id], [data-person-id], [data-student-number], [data-child-id], option, select, a, button, [role="tab"], [role="option"]',
      ),
    );

    return candidates
      .map((node) => {
        const element = node as HTMLElement;
        const text = (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
        const attributes = Object.fromEntries(Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value]));
        const selectorHint = [element.tagName.toLowerCase(), element.id ? `#${element.id}` : '', element.className ? `.${String(element.className).trim().replace(/\s+/g, '.')}` : '']
          .filter(Boolean)
          .join('');

        return {
          text,
          attributes,
          selectorHint,
        };
      })
      .filter((item) => {
        const serialized = `${item.text} ${Object.keys(item.attributes).join(' ')} ${Object.values(item.attributes).join(' ')}`.toLowerCase();
        return /student|child|person|grade|schedule|attendance/.test(serialized) || 'data-student-id' in item.attributes || 'data-person-id' in item.attributes;
      })
      .slice(0, 200);
  })) as Array<{ text: string; attributes: Record<string, string>; selectorHint: string }>;

  return rawHints
    .map((hint) => normalizeStudentHint({
      source: 'dom',
      pageKey,
      location: page.url(),
      selectorHint: hint.selectorHint,
      raw: hint.attributes,
      displayName: firstNonEmpty([
        hint.attributes['data-student-name'],
        hint.attributes['data-child-name'],
        inferDisplayName(hint.text),
      ]),
      studentId: firstNonEmpty([
        hint.attributes['data-student-id'],
        hint.attributes['student-id'],
        hint.attributes['value'],
      ]),
      personId: firstNonEmpty([hint.attributes['data-person-id'], hint.attributes['person-id']]),
      studentNumber: firstNonEmpty([hint.attributes['data-student-number']]),
    }))
    .filter((hint): hint is StudentHint => Boolean(hint));
}

async function extractNavigationLinks(page: Page): Promise<NavigationLink[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'))
      .map((node) => {
        const element = node as HTMLElement;
        const text = (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
        const href = element instanceof HTMLAnchorElement ? element.href : undefined;
        return {
          label: text,
          text,
          href,
        };
      })
      .filter((item) => item.text)
      .slice(0, 300);
  });
}

function classifyLinksByTarget(links: NavigationLink[]): Map<Exclude<PageKey, 'login'>, string[]> {
  const grouped = new Map<Exclude<PageKey, 'login'>, string[]>();

  for (const target of PAGE_TARGETS) {
    for (const link of links) {
      if (!link.href) {
        continue;
      }

      if (target.navMatchers.some((matcher) => matcher.test(link.text))) {
        const existing = grouped.get(target.key) ?? [];
        existing.push(link.href);
        grouped.set(target.key, existing);
      }
    }
  }

  return grouped;
}

function addDiscoveredLink(
  discoveredLinks: Map<Exclude<PageKey, 'login'>, Set<string>>,
  pageKey: Exclude<PageKey, 'login'>,
  url: string,
): void {
  const urls = discoveredLinks.get(pageKey) ?? new Set<string>();
  urls.add(url);
  discoveredLinks.set(pageKey, urls);
}

function buildPageCandidateUrls(baseUrl: string, candidateSlugs: string[], discovered?: Set<string>): string[] {
  const candidates = new Set<string>(discovered ?? []);
  const portalRoot = derivePortalRoot(baseUrl);

  for (const slug of candidateSlugs) {
    if (!slug) {
      candidates.add(baseUrl);
      continue;
    }

    candidates.add(buildAbsoluteUrl(baseUrl, slug));
    if (portalRoot) {
      candidates.add(new URL(`${portalRoot}/${slug}`.replace(/([^:]\/)\/+/, '$1'), new URL(baseUrl).origin).toString());
    }
  }

  return [...candidates];
}

function derivePortalRoot(baseUrl: string): string | undefined {
  const pathname = new URL(baseUrl).pathname.replace(/\/$/, '');
  const portalMatch = pathname.match(/^(.*\/campus\/portal)(?:\/.*)?$/i);
  if (portalMatch) {
    return portalMatch[1];
  }

  const campusMatch = pathname.match(/^(.*\/campus)(?:\/.*)?$/i);
  return campusMatch?.[1];
}

function buildAbsoluteUrl(baseUrl: string, candidate: string): string {
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  const base = ensureTrailingSlash(baseUrl);
  if (candidate.startsWith('/')) {
    return new URL(candidate, new URL(baseUrl).origin).toString();
  }

  return new URL(candidate, base).toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

async function waitForPendingTasks(tasks: Set<Promise<void>>): Promise<void> {
  while (tasks.size > 0) {
    await Promise.allSettled([...tasks]);
  }
}

function looksTextual(body: Buffer, contentType: string): boolean {
  if (/json|text|html|xml|javascript/.test(contentType)) {
    return true;
  }

  const preview = body.subarray(0, 64).toString('utf8');
  return !/\u0000/.test(preview);
}

function extractStudentsFromNetwork(entries: NetworkEntry[]): StudentHint[] {
  const students: StudentHint[] = [];

  for (const entry of entries) {
    const body = entry.responseBodyText;
    if (!body) {
      continue;
    }

    const trimmed = body.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      continue;
    }

    try {
      const payload = JSON.parse(trimmed) as JsonValue;
      students.push(...scanJsonForStudents(payload, entry.url, entry.pageKey));
    } catch {
      continue;
    }
  }

  return dedupeStudents(students);
}

function scanJsonForStudents(payload: JsonValue, endpointUrl: string, pageKey: PageKey, pathPrefix = '$'): StudentHint[] {
  const students: StudentHint[] = [];

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      students.push(...scanJsonForStudents(item, endpointUrl, pageKey, `${pathPrefix}[${index}]`));
    });
    return students;
  }

  if (!payload || typeof payload !== 'object') {
    return students;
  }

  const record = payload as Record<string, JsonValue>;
  const normalized = normalizeStudentHint({
    source: 'network',
    pageKey,
    endpointUrl,
    location: pathPrefix,
    displayName: firstNonEmpty([
      asString(record.displayName),
      asString(record.studentName),
      asString(record.name),
      joinNames(asString(record.firstName), asString(record.lastName)),
    ]),
    studentId: firstNonEmpty([
      asString(record.studentId),
      asString(record.studentID),
      asString(record.studentNumber),
    ]),
    personId: firstNonEmpty([asString(record.personId), asString(record.personID)]),
    studentNumber: asString(record.studentNumber),
    gradeLevel: firstNonEmpty([asString(record.grade), asString(record.gradeLevel)]),
    raw: record,
  });

  if (normalized) {
    students.push(normalized);
  }

  for (const [key, value] of Object.entries(record)) {
    students.push(...scanJsonForStudents(value, endpointUrl, pageKey, `${pathPrefix}.${key}`));
  }

  return students;
}

function normalizeStudentHint(input: StudentHint): StudentHint | undefined {
  const displayName = input.displayName?.trim();
  const studentId = input.studentId?.trim();
  const personId = input.personId?.trim();
  const studentNumber = input.studentNumber?.trim();

  if (!displayName && !studentId && !personId && !studentNumber) {
    return undefined;
  }

  if (displayName && /^(home|dashboard|grades|attendance|schedule|assignments)$/i.test(displayName)) {
    return undefined;
  }

  return {
    ...input,
    displayName,
    studentId,
    personId,
    studentNumber,
    gradeLevel: input.gradeLevel?.trim(),
  };
}

function dedupeStudents(students: StudentHint[]): StudentHint[] {
  const seen = new Map<string, StudentHint>();

  for (const student of students) {
    const key = [student.displayName, student.studentId, student.personId, student.studentNumber].filter(Boolean).join('|');
    if (!key) {
      continue;
    }

    if (!seen.has(key)) {
      seen.set(key, student);
    }
  }

  return [...seen.values()];
}

function summarizeEndpoints(entries: NetworkEntry[]): string[] {
  return [...new Set(entries.map((entry) => `${entry.method} ${stripQuery(entry.url)}`))].sort();
}

function stripQuery(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function inferDisplayName(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 80) {
    return undefined;
  }

  if (/^[A-Za-z]+(?: [A-Za-z'.-]+){1,3}$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function joinNames(firstName?: string, lastName?: string): string | undefined {
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  return combined || undefined;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()));
}

function asString(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

void main().catch((error: unknown) => {
  console.error(`Infinite Campus discovery failed: ${toErrorMessage(error)}`);
  process.exitCode = 1;
});
