import gradesFixture from './fixtures/grades.json';
import attendanceFixture from './fixtures/attendance.json';
import scheduleFixture from './fixtures/schedule.json';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { InfiniteCampusClient, InfiniteCampusError } from '../src/client';

const loginPagePath = '/campus/portal/login';
const loginPostPath = '/campus/login';
const apiBasePath = '/api/portal';

function createClient() {
  return new InfiniteCampusClient({
    baseUrl: 'https://campus.example.test',
    username: 'parent@example.test',
    password: 'secret',
    sessionTtlMs: 60_000,
    loginPagePath,
    loginPath: loginPostPath,
    apiBasePath,
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Infinite Campus fixtures', () => {
  test('cover multiple students, missing grades, and special characters', () => {
    expect(gradesFixture.students.length, 'Infinite Campus fixtures should cover multiple students.').toBeGreaterThan(1);
    expect(
      gradesFixture.students.some((student) => student.displayName.includes('Zoë')),
      'Infinite Campus fixtures should include special characters in student names.',
    ).toBe(true);
    expect(
      gradesFixture.students.some((student) => student.courses.some((course) => course.letterGrade === null)),
      'Infinite Campus fixtures should include an ungraded class.',
    ).toBe(true);
  });
});

describe('Infinite Campus client', () => {
  test('reads grades, attendance, and schedule from mocked responses', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(loginPagePath)) {
        return textResponse('<html>login</html>');
      }
      if (url.endsWith(loginPostPath) && init?.method === 'POST') {
        return textResponse('<html>home</html>', { headers: { 'set-cookie': 'session=ok; Path=/;' } });
      }
      if (url.includes('/students')) {
        return jsonResponse({ students: gradesFixture.students.map(({ courses, ...student }) => student) });
      }
      if (url.includes('/grades')) {
        return jsonResponse({ grades: gradesFixture.students[0].courses });
      }
      if (url.includes('/attendance')) {
        return jsonResponse(attendanceFixture);
      }
      if (url.includes('/schedule')) {
        return jsonResponse(scheduleFixture);
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();
    const grades = await client.getGrades({ studentId: 'ic-1001' });
    const attendance = await client.getAttendance({ studentId: 'ic-1001' });
    const schedule = await client.getSchedule({ studentId: 'ic-1001' });

    expect(grades.grades[0]?.courseName, 'Infinite Campus grades should come back from mocked data.').toBe('Math 7');
    expect(attendance.records[1]?.status, 'Infinite Campus attendance should preserve tardy records.').toBe('tardy');
    expect(schedule.entries[2]?.courseName, 'Infinite Campus schedule should include advisory blocks.').toBe('Advisory');
    expect(fetchMock, 'Infinite Campus tests should stay offline by mocking fetch.').toHaveBeenCalled();
  });

  test('explains when the parent sign-in has expired', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(loginPagePath)) {
        return textResponse('<html>login</html>');
      }
      if (url.endsWith(loginPostPath)) {
        return textResponse('<html>invalid username or password</html>', { status: 401 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient().getGrades({ studentId: 'ic-1001' })).rejects.toMatchObject({
      userMessage: 'Could not connect to Infinite Campus — check your username and password.',
    });
  });

  test('bubbles up network outages and timeouts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('request timed out'), { name: 'AbortError' });
      }),
    );

    await expect(createClient().getAttendance({ studentId: 'ic-1001' })).rejects.toThrow('request timed out');
  });

  test('treats malformed API payloads and empty gradebooks as readable failures', async () => {
    const responses = [
      textResponse('<html>login</html>'),
      textResponse('<html>home</html>', { headers: { 'set-cookie': 'session=ok; Path=/;' } }),
      jsonResponse({ students: gradesFixture.students.map(({ courses, ...student }) => student) }),
      jsonResponse({ notGrades: true }),
      textResponse('<html>No grade rows yet</html>'),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift() ?? new Response('not found', { status: 404 })));

    await expect(createClient().getGrades({ studentId: 'ic-1001' })).rejects.toBeInstanceOf(InfiniteCampusError);
  });

  test('flags ambiguous student selection when multiple children are linked', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(loginPagePath)) {
        return textResponse('<html>login</html>');
      }
      if (url.endsWith(loginPostPath) && init?.method === 'POST') {
        return textResponse('<html>home</html>', { headers: { 'set-cookie': 'session=ok; Path=/;' } });
      }
      if (url.includes('/students')) {
        return jsonResponse({ students: gradesFixture.students.map(({ courses, ...student }) => student) });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient().getSchedule()).rejects.toMatchObject({
      userMessage: 'More than one student is available. Please pass studentId or studentName so I know which child to use.',
    });
  });
});
