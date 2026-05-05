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

  test('fetches assignments via grade detail fallback when generic endpoints fail', async () => {
    const gradesList = [
      {
        enrollmentID: 480980,
        terms: [
          {
            termID: 1198,
            termName: 'S2',
            startDate: '2026-01-06',
            endDate: '2026-05-20',
            courses: [
              {
                sectionID: 2032025,
                courseName: 'Math 7',
                gradingTasks: [{ taskID: 3, hasAssignments: true, hasDetail: true }],
              },
            ],
          },
        ],
      },
    ];

    const gradeDetail = {
      details: [
        {
          task: { courseName: 'Math 7', sectionID: 2032025 },
          categories: [
            {
              name: 'Daily Assignments',
              assignments: [
                {
                  assignmentName: 'Geometry Review',
                  courseName: 'Math 7',
                  dueDate: '2026-05-04T12:35:00.000Z',
                  totalPoints: 100,
                  score: '95',
                  scorePoints: '95.0',
                  missing: false,
                  late: false,
                },
                {
                  assignmentName: 'Trapezoids HW',
                  courseName: 'Math 7',
                  dueDate: '2026-05-01T12:35:00.000Z',
                  totalPoints: 50,
                  score: '',
                  scorePoints: '',
                  missing: true,
                  late: false,
                },
              ],
            },
          ],
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(loginPagePath)) return textResponse('<html>login</html>');
      if (url.endsWith(loginPostPath) && init?.method === 'POST') {
        return textResponse('<html>home</html>', { headers: { 'set-cookie': 'session=ok; Path=/;' } });
      }
      if (url.includes('/students')) {
        return jsonResponse({ students: [{ personID: 96854, studentId: 'ic-1001', displayName: 'Lucas Spaid' }] });
      }
      // Generic assignment endpoints should 404 to trigger fallback
      if (url.includes('/assignments')) return new Response('not found', { status: 404 });
      // Grades list
      if (url.includes('/resources/portal/grades') && !url.includes('/detail/')) return jsonResponse(gradesList);
      // Grade detail for sectionID 2032025
      if (url.includes('/grades/detail/2032025')) return jsonResponse(gradeDetail);
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();
    const result = await client.getAssignments({ studentId: 'ic-1001' });

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0].title).toBe('Geometry Review');
    expect(result.assignments[0].courseName).toBe('Math 7');
    expect(result.assignments[0].category).toBe('Daily Assignments');
    expect(result.assignments[0].pointsPossible).toBe(100);
    expect(result.assignments[0].isMissing).toBe(false);
    expect(result.assignments[1].title).toBe('Trapezoids HW');
    expect(result.assignments[1].isMissing).toBe(true);
    expect(result.source).toBe('api');
  });

  test('filters to missing-only assignments when filter is set', async () => {
    const gradesList = [
      {
        enrollmentID: 480980,
        terms: [
          {
            termID: 1198,
            termName: 'S2',
            courses: [
              {
                sectionID: 2032025,
                courseName: 'Math 7',
                gradingTasks: [{ taskID: 3, hasDetail: true }],
              },
            ],
          },
        ],
      },
    ];

    const gradeDetail = {
      details: [
        {
          task: { courseName: 'Math 7' },
          categories: [
            {
              name: 'Tests',
              assignments: [
                { assignmentName: 'Ch5 Test', courseName: 'Math 7', totalPoints: 100, score: '88', missing: false, late: false },
                { assignmentName: 'Ch6 Test', courseName: 'Math 7', totalPoints: 100, score: '', missing: true, late: false },
                { assignmentName: 'Ch7 Test', courseName: 'Math 7', totalPoints: 100, score: '', missing: true, late: true },
              ],
            },
          ],
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(loginPagePath)) return textResponse('<html>login</html>');
      if (url.endsWith(loginPostPath) && init?.method === 'POST') {
        return textResponse('<html>home</html>', { headers: { 'set-cookie': 'session=ok; Path=/;' } });
      }
      if (url.includes('/students')) {
        return jsonResponse({ students: [{ personID: 96854, studentId: 'ic-1001', displayName: 'Lucas Spaid' }] });
      }
      if (url.includes('/assignments')) return new Response('not found', { status: 404 });
      if (url.includes('/resources/portal/grades') && !url.includes('/detail/')) return jsonResponse(gradesList);
      if (url.includes('/grades/detail/')) return jsonResponse(gradeDetail);
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();
    const result = await client.getAssignments({ studentId: 'ic-1001', filter: 'missing' });

    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.every((a) => a.isMissing === true)).toBe(true);
    expect(result.assignments[0].title).toBe('Ch6 Test');
    expect(result.assignments[1].title).toBe('Ch7 Test');
    expect(result.assignments[1].isLate).toBe(true);
  });
});
