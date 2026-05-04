import gradesFixture from './fixtures/grades.json';
import { describe, expect, test, vi } from 'vitest';
import { createServer } from '../src/index';
import { InfiniteCampusError } from '../src/client';

function createMockClient() {
  return {
    healthCheck: vi.fn(async () => ({ ok: true, message: 'Connected to Infinite Campus.', authenticated: true, baseUrl: 'https://campus.example.test', studentCount: 2 })),
    getGrades: vi.fn(async () => ({ student: { studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' }, grades: gradesFixture.students[0].courses.map((course) => ({ ...course, source: 'api' })), source: 'api' })),
    getAttendance: vi.fn(async () => ({ student: { studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' }, records: [], source: 'api' })),
    getSchedule: vi.fn(async () => ({ student: { studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' }, entries: [], source: 'api' })),
    getAssignments: vi.fn(async () => ({ student: { studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' }, assignments: [], source: 'api' })),
    getReportCard: vi.fn(async () => ({ student: { studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' }, courses: [], source: 'api' })),
    getDefaultStudentProfileForResource: vi.fn(async () => ({ studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' })),
    getCurrentGradesForResource: vi.fn(async () => ({ student: { studentId: 'ic-1001', displayName: 'Alex Johnson', source: 'api' }, grades: [], source: 'api' })),
  };
}

describe('Infinite Campus MCP server', () => {
  test('registers parent-facing tools with schemas', () => {
    const { tools } = createServer(createMockClient() as never);
    expect(tools.map((tool) => tool.name), 'Infinite Campus MCP server should expose the main parent tools.').toEqual([
      'health_check',
      'get_grades',
      'get_attendance',
      'get_schedule',
      'get_assignments',
      'get_report_card',
    ]);
    for (const tool of tools.filter((tool) => tool.name !== 'health_check')) {
      expect(tool.inputSchema, `Tool ${tool.name} should publish an MCP input schema.`).toBeTruthy();
    }
  });

  test('returns structured tool content for successful calls', async () => {
    const client = createMockClient();
    const server = createServer(client as never);

    const result = await server.callTool('get_grades', { studentId: 'ic-1001' });
    expect(client.getGrades, 'The grades tool should delegate to the Infinite Campus client.').toHaveBeenCalledWith({ studentId: 'ic-1001' });
    expect(result.isError, 'Successful tool calls should not be marked as errors.').toBeUndefined();
    expect(result.content[0]?.text.includes('Math 7'), 'Successful tool calls should return readable grade content.').toBe(true);
  });

  test('returns parent-friendly strings for handled Infinite Campus errors', async () => {
    const client = createMockClient();
    client.getGrades.mockRejectedValueOnce(
      new InfiniteCampusError('401 from Campus', 'Your Infinite Campus session expired. Please sign in again.'),
    );
    const server = createServer(client as never);

    const result = await server.callTool('get_grades', { studentId: 'ic-1001' });
    expect(result.isError, 'Handled client errors should come back as MCP tool errors.').toBe(true);
    expect(result.content[0]?.text, 'Parents should get a plain-language Infinite Campus error message.').toBe(
      'Your Infinite Campus session expired. Please sign in again.',
    );
  });

  test('hides raw stack noise for unexpected failures', async () => {
    const client = createMockClient();
    client.getGrades.mockRejectedValueOnce(new Error('ECONNRESET while calling Campus upstream'));
    const server = createServer(client as never);

    const result = await server.callTool('get_grades', { studentId: 'ic-1001' });
    expect(result.content[0]?.text, 'Unexpected failures should be translated into a calm retry message.').toBe(
      'Could not connect to Infinite Campus — please try again.',
    );
  });
});
