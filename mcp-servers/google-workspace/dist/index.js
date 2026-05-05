"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const auth_1 = require("./auth");
const client_1 = require("./client");
const server = new mcp_js_1.McpServer({
    name: 'google-workspace',
    version: '0.1.0',
}, {
    instructions: 'Use these tools to read Google Classroom, Drive, Sheets, and Calendar data for the connected Google Workspace account. If Google access fails, tell the parent to reconnect using the setup steps.',
});
registerTool('google_workspace_health_check', {
    description: 'Check whether Google Workspace is connected and the refresh token still works.',
}, async () => runTool(async (client) => {
    const health = await client.healthCheck();
    return formatToolResult(health.message, { health });
}));
registerTool('classroom_get_courses', {
    description: 'List active Google Classroom courses that the connected account can access.',
    inputSchema: {
        pageSize: zod_1.z.number().int().min(1).max(100).optional(),
    },
}, async ({ pageSize }) => runTool(async (client) => {
    const courses = await client.getCourses(pageSize);
    return formatToolResult(`Found ${courses.length} Google Classroom course${courses.length === 1 ? '' : 's'}.`, {
        courses,
    });
}));
registerTool('classroom_get_assignments', {
    description: 'Fetch Google Classroom assignments and coursework.',
    inputSchema: {
        courseId: zod_1.z.string().min(1).optional(),
        pageSize: zod_1.z.number().int().min(1).max(100).optional(),
        upcomingOnly: zod_1.z.boolean().optional(),
    },
}, async ({ courseId, pageSize, upcomingOnly }) => runTool(async (client) => {
    const assignments = await client.getAssignments({ courseId, pageSize, upcomingOnly });
    return formatToolResult(`Found ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}.`, { assignments });
}));
registerTool('classroom_get_announcements', {
    description: 'Fetch Google Classroom announcements.',
    inputSchema: {
        courseId: zod_1.z.string().min(1).optional(),
        pageSize: zod_1.z.number().int().min(1).max(100).optional(),
    },
}, async ({ courseId, pageSize }) => runTool(async (client) => {
    const announcements = await client.getAnnouncements({ courseId, pageSize });
    return formatToolResult(`Found ${announcements.length} classroom announcement${announcements.length === 1 ? '' : 's'}.`, { announcements });
}));
registerTool('drive_list_files', {
    description: 'List recent or shared Google Drive files.',
    inputSchema: {
        mode: zod_1.z.enum(['recent', 'shared']).optional(),
        pageSize: zod_1.z.number().int().min(1).max(100).optional(),
        query: zod_1.z.string().min(1).optional(),
    },
}, async ({ mode, pageSize, query }) => runTool(async (client) => {
    const files = await client.listDriveFiles({ mode, pageSize, query });
    return formatToolResult(`Found ${files.length} Google Drive file${files.length === 1 ? '' : 's'}.`, {
        files,
    });
}));
registerTool('drive_get_file', {
    description: 'Get Google Drive file metadata and, when possible, readable content.',
    inputSchema: {
        fileId: zod_1.z.string().min(1),
        includeContent: zod_1.z.boolean().optional(),
        maxContentBytes: zod_1.z.number().int().min(500).max(500000).optional(),
        sheetName: zod_1.z.string().min(1).optional(),
    },
}, async ({ fileId, includeContent, maxContentBytes, sheetName }) => runTool(async (client) => {
    const file = await client.getDriveFile({ fileId, includeContent, maxContentBytes, sheetName });
    return formatToolResult(`Fetched Google Drive file “${file.name}”.`, { file });
}));
registerTool('sheets_read', {
    description: 'Read values from a Google Sheet tab or A1 range.',
    inputSchema: {
        spreadsheetId: zod_1.z.string().min(1),
        range: zod_1.z.string().min(1).optional(),
        sheetName: zod_1.z.string().min(1).optional(),
    },
}, async ({ spreadsheetId, range, sheetName }) => runTool(async (client) => {
    const sheet = await client.readSheet({ spreadsheetId, range, sheetName });
    return formatToolResult(`Read ${sheet.rowCount} row${sheet.rowCount === 1 ? '' : 's'} from Google Sheet ${sheet.sheetName ? `“${sheet.sheetName}”` : 'data'}.`, { sheet });
}));
registerTool('calendar_get_events', {
    description: 'Get upcoming Google Calendar events.',
    inputSchema: {
        calendarId: zod_1.z.string().min(1).optional(),
        timeMin: zod_1.z.string().min(1).optional(),
        timeMax: zod_1.z.string().min(1).optional(),
        maxResults: zod_1.z.number().int().min(1).max(100).optional(),
    },
}, async ({ calendarId, timeMin, timeMax, maxResults }) => runTool(async (client) => {
    const events = await client.getCalendarEvents({ calendarId, timeMin, timeMax, maxResults });
    return formatToolResult(`Found ${events.length} calendar event${events.length === 1 ? '' : 's'}.`, {
        events,
    });
}));
server.registerResource('google-classroom-courses', 'google://classroom/courses', {
    title: 'Google Classroom Courses',
    description: 'Active Google Classroom courses for the connected account.',
    mimeType: 'application/json',
}, async (uri) => {
    const courses = await withClient(client => client.getCourses(100));
    return createJsonResource(uri.href, { courses });
});
server.registerResource('google-classroom-upcoming', 'google://classroom/upcoming', {
    title: 'Upcoming Classroom Assignments',
    description: 'Upcoming Google Classroom assignments across active courses.',
    mimeType: 'application/json',
}, async (uri) => {
    const assignments = await withClient(client => client.getAssignments({ upcomingOnly: true, pageSize: 50 }));
    return createJsonResource(uri.href, { assignments });
});
server.registerResource('google-drive-recent', 'google://drive/recent', {
    title: 'Recent Google Drive Files',
    description: 'Recently modified Google Drive files for the connected account.',
    mimeType: 'application/json',
}, async (uri) => {
    const files = await withClient(client => client.listDriveFiles({ mode: 'recent', pageSize: 25 }));
    return createJsonResource(uri.href, { files });
});
function registerTool(name, config, handler) {
    registerTool(name, config, handler);
}
async function withClient(callback) {
    const client = await client_1.GoogleWorkspaceClient.create();
    return callback(client);
}
async function runTool(callback) {
    try {
        return await withClient(callback);
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: (0, auth_1.getFriendlyGoogleErrorMessage)(error) }],
            isError: true,
        };
    }
}
function formatToolResult(summary, structuredContent) {
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
function createJsonResource(uri, payload) {
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
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
void main().catch(error => {
    console.error((0, auth_1.getFriendlyGoogleErrorMessage)(error));
    process.exit(1);
});
