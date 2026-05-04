#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { InfiniteCampusClient, InfiniteCampusError } from './client';

export * from './client';
export * from './types';

const studentSelectorFields = {
  studentId: z.string().optional().describe('Infinite Campus student/person identifier'),
  studentName: z.string().optional().describe('Student display name when more than one child is linked'),
};

const studentSelectorSchema = z.object(studentSelectorFields);
const gradesSchema = z.object({
  ...studentSelectorFields,
  term: z.string().optional().describe('School term name or code'),
  quarter: z.string().optional().describe('Quarter or grading task name'),
});
const attendanceSchema = z.object({
  ...studentSelectorFields,
  startDate: z.string().optional().describe('Optional ISO date lower bound'),
  endDate: z.string().optional().describe('Optional ISO date upper bound'),
});
const assignmentsSchema = z.object({
  ...studentSelectorFields,
  term: z.string().optional().describe('Optional school term to filter assignments'),
});
const reportCardSchema = z.object({
  ...studentSelectorFields,
  term: z.string().optional().describe('Optional report-card term name or code'),
});

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type ToolHandler = (args?: Record<string, unknown>) => Promise<ToolResult>;

export interface RegisteredToolDefinition {
  name: string;
  description: string;
  inputSchema?: any;
}

export interface InfiniteCampusServerHandle {
  server: McpServer;
  tools: RegisteredToolDefinition[];
  callTool: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
}

export function createClientFromEnv(): InfiniteCampusClient {
  return InfiniteCampusClient.fromEnv();
}

export function createServer(
  client: Pick<
    InfiniteCampusClient,
    | 'healthCheck'
    | 'getGrades'
    | 'getAttendance'
    | 'getSchedule'
    | 'getAssignments'
    | 'getReportCard'
    | 'getDefaultStudentProfileForResource'
    | 'getCurrentGradesForResource'
  > = createClientFromEnv(),
): InfiniteCampusServerHandle {
  const server = new McpServer({
    name: 'infinite-campus',
    version: '0.1.0',
  });
  const tools: RegisteredToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();

  const registerTool = (
    name: string,
    config: any,
    handler: ToolHandler,
  ) => {
    tools.push({ name, description: config.description, inputSchema: config.inputSchema });
    handlers.set(name, handler);
    server.registerTool(name, config, handler);
  };

  registerTool(
    'health_check',
    {
      description: 'Verify Infinite Campus connectivity and login credentials.',
    },
    async () => executeTool(async () => client.healthCheck()),
  );

  registerTool(
    'get_grades',
    {
      description: 'Fetch current grades for a student, optionally filtered by term or quarter.',
      inputSchema: gradesSchema,
    },
    async (args) => executeTool(async () => client.getGrades(args ?? {})),
  );

  registerTool(
    'get_attendance',
    {
      description: 'Fetch attendance records for a student.',
      inputSchema: attendanceSchema,
    },
    async (args) => executeTool(async () => client.getAttendance(args ?? {})),
  );

  registerTool(
    'get_schedule',
    {
      description: 'Fetch the active class schedule for a student.',
      inputSchema: studentSelectorSchema,
    },
    async (args) => executeTool(async () => client.getSchedule(args ?? {})),
  );

  registerTool(
    'get_assignments',
    {
      description: 'Fetch assignment details and scores for a student.',
      inputSchema: assignmentsSchema,
    },
    async (args) => executeTool(async () => client.getAssignments(args ?? {})),
  );

  registerTool(
    'get_report_card',
    {
      description: 'Fetch report card data for a student.',
      inputSchema: reportCardSchema,
    },
    async (args) => executeTool(async () => client.getReportCard(args ?? {})),
  );

  server.registerResource(
    'student-profile',
    'student://profile',
    {
      title: 'Student Profile',
      description: 'The default student profile from Infinite Campus.',
      mimeType: 'application/json',
    },
    async () => readJsonResource('student://profile', async () => client.getDefaultStudentProfileForResource()),
  );

  server.registerResource(
    'student-grades-current',
    'student://grades/current',
    {
      title: 'Current Grades',
      description: 'Current term grades for the default Infinite Campus student.',
      mimeType: 'application/json',
    },
    async () => readJsonResource('student://grades/current', async () => client.getCurrentGradesForResource()),
  );

  return {
    server,
    tools,
    callTool: async (name, args = {}) => {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return handler(args);
    },
  };
}

async function executeTool<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    const result = await fn();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof InfiniteCampusError ? error.userMessage : 'Could not connect to Infinite Campus — please try again.';
    return {
      content: [{ type: 'text' as const, text: message }],
      isError: true,
    };
  }
}

async function readJsonResource<T>(uri: string, fn: () => Promise<T>) {
  try {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(await fn(), null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof InfiniteCampusError ? error.userMessage : 'Could not connect to Infinite Campus — please try again.';
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
    };
  }
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const { server } = createServer();
  await server.connect(transport);
  console.error('[infinite-campus] MCP server running on stdio');
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof InfiniteCampusError ? error.userMessage : error instanceof Error ? error.message : 'Unknown startup error';
    console.error(`[infinite-campus] ${message}`);
    process.exit(1);
  });
}
