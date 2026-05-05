import { describe, expect, test, vi, beforeEach } from 'vitest';
import { CanvasClient, CanvasApiError, CanvasConfigurationError } from '../src/client.js';

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: new Headers({
        'x-rate-limit-remaining': '100',
        ...response.headers,
      }),
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    } as unknown as Response;
  });
}

function createClient(fetchImpl: typeof fetch, opts?: { defaultObservedUserId?: string }) {
  return new CanvasClient({
    baseUrl: 'https://canvas.example.test',
    apiToken: 'test-token-123',
    defaultObservedUserId: opts?.defaultObservedUserId,
    fetchImpl,
  });
}

describe('CanvasClient configuration', () => {
  test('throws CanvasConfigurationError when baseUrl is empty', () => {
    expect(() => new CanvasClient({ baseUrl: '', apiToken: 'token' })).toThrow(CanvasConfigurationError);
  });

  test('throws CanvasConfigurationError when apiToken is empty', () => {
    expect(() => new CanvasClient({ baseUrl: 'https://x.test', apiToken: '' })).toThrow(CanvasConfigurationError);
  });

  test('throws CanvasConfigurationError for malformed URL', () => {
    expect(() => new CanvasClient({ baseUrl: 'not-a-url', apiToken: 'token' })).toThrow(CanvasConfigurationError);
  });

  test('fromEnv reads CANVAS_BASE_URL and CANVAS_API_TOKEN', () => {
    const client = CanvasClient.fromEnv({
      CANVAS_BASE_URL: 'https://canvas.example.test',
      CANVAS_API_TOKEN: 'tok',
      CANVAS_OBSERVED_USER_ID: '42',
    } as unknown as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(CanvasClient);
  });
});

describe('CanvasClient.resolveObservedUserId', () => {
  test('uses explicit observedUserId when provided', async () => {
    const fetchFn = mockFetch([]);
    const client = createClient(fetchFn, { defaultObservedUserId: '99' });
    const id = await client.resolveObservedUserId('42');
    expect(id).toBe('42');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('uses defaultObservedUserId from config when no explicit id', async () => {
    const fetchFn = mockFetch([]);
    const client = createClient(fetchFn, { defaultObservedUserId: '99' });
    const id = await client.resolveObservedUserId();
    expect(id).toBe('99');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('auto-resolves to single observee', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: [{ id: '77', name: 'Student One', short_name: 'S1' }] },
    ]);
    const client = createClient(fetchFn);
    const id = await client.resolveObservedUserId();
    expect(id).toBe('77');
  });

  test('throws when multiple observees and no default set', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] },
    ]);
    const client = createClient(fetchFn);
    await expect(client.resolveObservedUserId()).rejects.toThrow(CanvasConfigurationError);
  });

  test('returns "self" when no observees exist', async () => {
    const fetchFn = mockFetch([{ status: 200, body: [] }]);
    const client = createClient(fetchFn);
    const id = await client.resolveObservedUserId();
    expect(id).toBe('self');
  });
});

describe('CanvasClient.getCourses', () => {
  test('returns mapped course summaries', async () => {
    const rawCourses = [
      {
        id: '101',
        name: 'Math 7',
        course_code: 'MATH-7',
        workflow_state: 'available',
        start_at: '2026-01-01T00:00:00Z',
        end_at: null,
        term: { id: '1', name: 'Spring 2026' },
        teachers: [{ id: '10', display_name: 'Ms. Rivera' }],
      },
    ];
    const fetchFn = mockFetch([{ status: 200, body: rawCourses }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const courses = await client.getCourses();
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      id: '101',
      name: 'Math 7',
      courseCode: 'MATH-7',
      termName: 'Spring 2026',
      teacherNames: ['Ms. Rivera'],
    });
  });
});

describe('CanvasClient pagination', () => {
  test('follows Link header for next page', async () => {
    const page1 = [{ id: '1', name: 'Course A', course_code: 'A', teachers: [] }];
    const page2 = [{ id: '2', name: 'Course B', course_code: 'B', teachers: [] }];
    const fetchFn = mockFetch([
      {
        status: 200,
        body: page1,
        headers: { link: '<https://canvas.example.test/api/v1/users/42/courses?page=2>; rel="next"' },
      },
      { status: 200, body: page2 },
    ]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const courses = await client.getCourses();
    expect(courses).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('CanvasClient error handling', () => {
  test('throws CanvasApiError with auth message on 401', async () => {
    const fetchFn = mockFetch([{ status: 401, body: { message: 'invalid token' } }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    await expect(client.getCourses()).rejects.toThrow(CanvasApiError);
    await expect(client.getCourses()).rejects.toThrow(/token/i);
  });

  test('throws CanvasApiError with not-found message on 404', async () => {
    const fetchFn = mockFetch([{ status: 404, body: {} }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    await expect(client.getCourses()).rejects.toThrow(/could not find/i);
  });

  test('retries on 429 and succeeds', async () => {
    const courses = [{ id: '1', name: 'Math', course_code: 'M', teachers: [] }];
    const fetchFn = mockFetch([
      { status: 429, body: {}, headers: { 'retry-after': '0' } },
      { status: 200, body: courses },
    ]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const result = await client.getCourses();
    expect(result).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test('throws after max retries on persistent 429', async () => {
    const fetchFn = mockFetch([
      { status: 429, body: {}, headers: { 'retry-after': '0' } },
      { status: 429, body: {}, headers: { 'retry-after': '0' } },
      { status: 429, body: {}, headers: { 'retry-after': '0' } },
    ]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    await expect(client.getCourses()).rejects.toThrow(CanvasApiError);
  });
});

describe('CanvasClient.getAssignments', () => {
  test('returns assignment summaries with submission status', async () => {
    const rawAssignments = [
      {
        id: '9001',
        name: 'Unit 9 Quiz',
        course_id: '101',
        due_at: '2026-05-05T08:00:00Z',
        points_possible: 20,
        published: true,
        submission_types: ['online_quiz'],
        submission: {
          submitted_at: '2026-05-04T12:00:00Z',
          grade: '85%',
          score: 17,
          late: false,
          missing: false,
          excused: false,
          workflow_state: 'graded',
        },
      },
      {
        id: '9002',
        name: 'Missing Work',
        course_id: '101',
        due_at: '2026-04-20T23:59:00Z',
        points_possible: 10,
        published: true,
        submission_types: ['online_upload'],
        submission: {
          submitted_at: null,
          grade: null,
          score: null,
          late: false,
          missing: true,
          excused: false,
          workflow_state: 'unsubmitted',
        },
      },
    ];
    const fetchFn = mockFetch([{ status: 200, body: rawAssignments }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const assignments = await client.getAssignments('101');
    expect(assignments).toHaveLength(2);
    expect(assignments[0].submissionStatus).toBe('graded');
    expect(assignments[1].submissionStatus).toBe('missing');
  });

  test('derives "submitted" status when submitted but not graded', async () => {
    const rawAssignments = [
      {
        id: '9003',
        name: 'Essay',
        course_id: '102',
        due_at: '2026-05-09T23:59:00Z',
        points_possible: 50,
        published: true,
        submission_types: ['online_text_entry'],
        submission: {
          submitted_at: '2026-05-08T10:00:00Z',
          grade: null,
          score: null,
          late: false,
          missing: false,
          excused: false,
          workflow_state: 'submitted',
        },
      },
    ];
    const fetchFn = mockFetch([{ status: 200, body: rawAssignments }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const assignments = await client.getAssignments('102');
    expect(assignments[0].submissionStatus).toBe('submitted');
  });

  test('derives "pending" when no submission exists', async () => {
    const rawAssignments = [
      {
        id: '9004',
        name: 'Future Work',
        course_id: '101',
        due_at: '2026-06-01T23:59:00Z',
        points_possible: 30,
        published: true,
        submission_types: ['online_upload'],
        submission: null,
      },
    ];
    const fetchFn = mockFetch([{ status: 200, body: rawAssignments }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const assignments = await client.getAssignments('101');
    expect(assignments[0].submissionStatus).toBe('pending');
  });

  test('derives "excused" status', async () => {
    const rawAssignments = [
      {
        id: '9005',
        name: 'Excused Quiz',
        course_id: '101',
        due_at: '2026-05-01T08:00:00Z',
        points_possible: 20,
        published: true,
        submission_types: ['online_quiz'],
        submission: { excused: true, submitted_at: null, grade: null, score: null, late: false, missing: false },
      },
    ];
    const fetchFn = mockFetch([{ status: 200, body: rawAssignments }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const assignments = await client.getAssignments('101');
    expect(assignments[0].submissionStatus).toBe('excused');
  });
});

describe('CanvasClient.getSubmissions', () => {
  test('fetches submission detail for specific assignment', async () => {
    const submission = {
      id: '5001',
      assignment_id: '9001',
      user_id: '42',
      submitted_at: '2026-05-04T12:00:00Z',
      score: 17,
      grade: '85%',
      late: false,
      missing: false,
      submission_comments: [{ id: '1', comment: 'Great work!' }],
    };
    const fetchFn = mockFetch([{ status: 200, body: submission }]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const result = await client.getSubmissions('101', '9001');
    expect(result.score).toBe(17);
    expect(result.submission_comments).toHaveLength(1);
  });
});

describe('CanvasClient.getGrades', () => {
  test('returns grade summaries from enrollments', async () => {
    const courses = [
      { id: '101', name: 'Math 7', course_code: 'M7', teachers: [], workflow_state: 'available' },
    ];
    const enrollments = [
      {
        id: '1001',
        course_id: '101',
        user_id: '42',
        enrollment_state: 'active',
        grades: { current_score: 92, current_grade: 'A-', final_score: 90, final_grade: 'A-' },
      },
    ];
    const fetchFn = mockFetch([
      { status: 200, body: courses },
      { status: 200, body: enrollments },
    ]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const grades = await client.getGrades();
    expect(grades).toHaveLength(1);
    expect(grades[0]).toMatchObject({
      courseId: '101',
      courseName: 'Math 7',
      currentScore: 92,
      currentGrade: 'A-',
    });
  });
});

describe('CanvasClient rate limit pacing', () => {
  test('pauses when rate limit remaining is low', async () => {
    const courses = [{ id: '1', name: 'Test', course_code: 'T', teachers: [] }];
    const fetchFn = mockFetch([
      { status: 200, body: courses, headers: { 'x-rate-limit-remaining': '3' } },
    ]);
    const client = createClient(fetchFn, { defaultObservedUserId: '42' });
    const result = await client.getCourses();
    expect(result).toHaveLength(1);
  });
});
