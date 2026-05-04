import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getFriendlyGoogleErrorMessage } from './auth';
import { GoogleWorkspaceClient } from './client';
import type {
  CalendarEventsQuery,
  ClassroomAnnouncementsQuery,
  ClassroomAssignmentsQuery,
  DriveGetFileQuery,
  DriveListFilesQuery,
  SheetsReadQuery,
} from './types';

const server = new McpServer(
  {
    name: 'google-workspace',
    version: '0.1.0',
  },
  {
    instructions:
      'Use these tools to read Google Classroom, Drive, Sheets, and Calendar data for the connected Google Workspace account. If Google access fails, tell the parent to reconnect using the setup steps.',
  },
);

registerTool(
  'google_workspace_health_check',
  {
    description: 'Check whether Google Workspace is connected and the refresh token still works.',
  },
  async (): Promise<CallToolResult> =>
    runTool(async client => {
      const health = await client.healthCheck();
      return formatToolResult(health.message, { health });
    }),
);

registerTool(
  'classroom_get_courses',
  {
    description: 'List active Google Classroom courses that the connected account can access.',
    inputSchema: {
      pageSize: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ pageSize }: { pageSize?: number }): Promise<CallToolResult> =>
    runTool(async client => {
      const courses = await client.getCourses(pageSize);
      return formatToolResult(`Found ${courses.length} Google Classroom course${courses.length === 1 ? '' : 's'}.`, {
        courses,
      });
    }),
);

registerTool(
  'classroom_get_assignments',
  {
    description: 'Fetch Google Classroom assignments and coursework.',
    inputSchema: {
      courseId: z.string().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      upcomingOnly: z.boolean().optional(),
    },
  },
  async ({ courseId, pageSize, upcomingOnly }: ClassroomAssignmentsQuery): Promise<CallToolResult> =>
    runTool(async client => {
      const assignments = await client.getAssignments({ courseId, pageSize, upcomingOnly });
      return formatToolResult(
        `Found ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}.`,
        { assignments },
      );
    }),
);

registerTool(
  'classroom_get_announcements',
  {
    description: 'Fetch Google Classroom announcements.',
    inputSchema: {
      courseId: z.string().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ courseId, pageSize }: ClassroomAnnouncementsQuery): Promise<CallToolResult> =>
    runTool(async client => {
      const announcements = await client.getAnnouncements({ courseId, pageSize });
      return formatToolResult(
        `Found ${announcements.length} classroom announcement${announcements.length === 1 ? '' : 's'}.`,
        { announcements },
      );
    }),
);

registerTool(
  'drive_list_files',
  {
    description: 'List recent or shared Google Drive files.',
    inputSchema: {
      mode: z.enum(['recent', 'shared']).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      query: z.string().min(1).optional(),
    },
  },
  async ({ mode, pageSize, query }: DriveListFilesQuery): Promise<CallToolResult> =>
    runTool(async client => {
      const files = await client.listDriveFiles({ mode, pageSize, query });
      return formatToolResult(`Found ${files.length} Google Drive file${files.length === 1 ? '' : 's'}.`, {
        files,
      });
    }),
);

registerTool(
  'drive_get_file',
  {
    description: 'Get Google Drive file metadata and, when possible, readable content.',
    inputSchema: {
      fileId: z.string().min(1),
      includeContent: z.boolean().optional(),
      maxContentBytes: z.number().int().min(500).max(500000).optional(),
      sheetName: z.string().min(1).optional(),
    },
  },
  async ({ fileId, includeContent, maxContentBytes, sheetName }: DriveGetFileQuery): Promise<CallToolResult> =>
    runTool(async client => {
      const file = await client.getDriveFile({ fileId, includeContent, maxContentBytes, sheetName });
      return formatToolResult(`Fetched Google Drive file “${file.name}”.`, { file });
    }),
);

registerTool(
  'sheets_read',
  {
    description: 'Read values from a Google Sheet tab or A1 range.',
    inputSchema: {
      spreadsheetId: z.string().min(1),
      range: z.string().min(1).optional(),
      sheetName: z.string().min(1).optional(),
    },
  },
  async ({ spreadsheetId, range, sheetName }: SheetsReadQuery): Promise<CallToolResult> =>
    runTool(async client => {
      const sheet = await client.readSheet({ spreadsheetId, range, sheetName });
      return formatToolResult(
        `Read ${sheet.rowCount} row${sheet.rowCount === 1 ? '' : 's'} from Google Sheet ${sheet.sheetName ? `“${sheet.sheetName}”` : 'data'}.`,
        { sheet },
      );
    }),
);

registerTool(
  'calendar_get_events',
  {
    description: 'Get upcoming Google Calendar events.',
    inputSchema: {
      calendarId: z.string().min(1).optional(),
      timeMin: z.string().min(1).optional(),
      timeMax: z.string().min(1).optional(),
      maxResults: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ calendarId, timeMin, timeMax, maxResults }: CalendarEventsQuery): Promise<CallToolResult> =>
    runTool(async client => {
      const events = await client.getCalendarEvents({ calendarId, timeMin, timeMax, maxResults });
      return formatToolResult(`Found ${events.length} calendar event${events.length === 1 ? '' : 's'}.`, {
        events,
      });
    }),
);

server.registerResource(
  'google-classroom-courses',
  'google://classroom/courses',
  {
    title: 'Google Classroom Courses',
    description: 'Active Google Classroom courses for the connected account.',
    mimeType: 'application/json',
  },
  async uri => {
    const courses = await withClient(client => client.getCourses(100));
    return createJsonResource(uri.href, { courses });
  },
);

server.registerResource(
  'google-classroom-upcoming',
  'google://classroom/upcoming',
  {
    title: 'Upcoming Classroom Assignments',
    description: 'Upcoming Google Classroom assignments across active courses.',
    mimeType: 'application/json',
  },
  async uri => {
    const assignments = await withClient(client => client.getAssignments({ upcomingOnly: true, pageSize: 50 }));
    return createJsonResource(uri.href, { assignments });
  },
);

server.registerResource(
  'google-drive-recent',
  'google://drive/recent',
  {
    title: 'Recent Google Drive Files',
    description: 'Recently modified Google Drive files for the connected account.',
    mimeType: 'application/json',
  },
  async uri => {
    const files = await withClient(client => client.listDriveFiles({ mode: 'recent', pageSize: 25 }));
    return createJsonResource(uri.href, { files });
  },
);

function registerTool(
  name: string,
  config: Record<string, unknown>,
  handler: (args: any) => Promise<CallToolResult>,
): void {
  registerTool(name, config as never, handler as never);
}

async function withClient<T>(callback: (client: GoogleWorkspaceClient) => Promise<T>): Promise<T> {
  const client = await GoogleWorkspaceClient.create();
  return callback(client);
}

async function runTool(callback: (client: GoogleWorkspaceClient) => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await withClient(callback);
  } catch (error) {
    return {
      content: [{ type: 'text', text: getFriendlyGoogleErrorMessage(error) }],
      isError: true,
    };
  }
}

function formatToolResult(summary: string, structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${summary}\n\n${JSON.stringify(structuredContent, null, 2)}`,
      },
    ],
    structuredContent,
  };
}

function createJsonResource(uri: string, payload: Record<string, unknown>) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch(error => {
  console.error(getFriendlyGoogleErrorMessage(error));
  process.exit(1);
});
