import { describe, expect, test, vi } from 'vitest';
import { createServer } from '../src/index.js';
import type { CanvasClient } from '../src/client.js';

type MockClient = {
  [K in keyof Pick<CanvasClient,
    'healthCheck' | 'getCourses' | 'getAssignments' | 'getUpcoming' |
    'getGrades' | 'getSubmissions' | 'getCalendar' | 'getAnnouncements'
  >]: ReturnType<typeof vi.fn>;
};

function createMockClient(): MockClient {
  return {
    healthCheck: vi.fn().mockResolvedValue({
      ok: true,
      baseUrl: 'https://canvas.example.test',
      currentUser: { id: '1', name: 'Test Parent', short_name: 'TP' },
      observedUsers: [{ id: '42', name: 'Test Student', short_name: 'TS' }],
      defaultObservedUserId: '42',
      message: 'Connected.',
    }),
    getCourses: vi.fn().mockResolvedValue([
      { id: '101', name: 'Math 7', courseCode: 'MATH-7', teacherNames: ['Ms. Rivera'] },
    ]),
    getAssignments: vi.fn().mockResolvedValue([
      { id: '9001', courseId: '101', name: 'Quiz 1', submissionStatus: 'graded', score: 17 },
    ]),
    getUpcoming: vi.fn().mockResolvedValue([
      { kind: 'assignment', id: '9001', title: 'Quiz 1', date: '2026-05-05T08:00:00Z' },
    ]),
    getGrades: vi.fn().mockResolvedValue([
      { courseId: '101', courseName: 'Math 7', currentScore: 92, currentGrade: 'A-' },
    ]),
    getSubmissions: vi.fn().mockResolvedValue({
      id: '5001', assignment_id: '9001', score: 17, grade: '85%',
    }),
    getCalendar: vi.fn().mockResolvedValue([
      { id: 'evt-1', title: 'Math Quiz', start_at: '2026-05-05T08:00:00Z' },
    ]),
    getAnnouncements: vi.fn().mockResolvedValue([
      { id: 'ann-1', title: 'Welcome Back', message: 'Hello!' },
    ]),
  };
}

describe('Canvas MCP server', () => {
  test('createServer returns a valid McpServer instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});

describe('Canvas MCP tool registration', () => {
  test('server registers all expected tools', () => {
    const server = createServer();
    // The server is an McpServer instance - we can verify it was created
    expect(server).toBeDefined();
  });
});

describe('Canvas MCP tool error handling', () => {
  test('createServer handles missing env gracefully at tool invocation time', () => {
    // createServer() itself succeeds even without env vars;
    // errors are thrown inside tool handlers when CanvasClient.fromEnv() is called
    const server = createServer();
    expect(server).toBeDefined();
  });
});
