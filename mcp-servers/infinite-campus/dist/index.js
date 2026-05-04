#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClientFromEnv = createClientFromEnv;
exports.createServer = createServer;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const z = __importStar(require("zod"));
const client_1 = require("./client");
__exportStar(require("./client"), exports);
__exportStar(require("./types"), exports);
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
function createClientFromEnv() {
    return client_1.InfiniteCampusClient.fromEnv();
}
function createServer(client = createClientFromEnv()) {
    const server = new mcp_js_1.McpServer({
        name: 'infinite-campus',
        version: '0.1.0',
    });
    const tools = [];
    const handlers = new Map();
    const registerTool = (name, config, handler) => {
        tools.push({ name, description: config.description, inputSchema: config.inputSchema });
        handlers.set(name, handler);
        server.registerTool(name, config, handler);
    };
    registerTool('health_check', {
        description: 'Verify Infinite Campus connectivity and login credentials.',
    }, async () => executeTool(async () => client.healthCheck()));
    registerTool('get_grades', {
        description: 'Fetch current grades for a student, optionally filtered by term or quarter.',
        inputSchema: gradesSchema,
    }, async (args) => executeTool(async () => client.getGrades(args ?? {})));
    registerTool('get_attendance', {
        description: 'Fetch attendance records for a student.',
        inputSchema: attendanceSchema,
    }, async (args) => executeTool(async () => client.getAttendance(args ?? {})));
    registerTool('get_schedule', {
        description: 'Fetch the active class schedule for a student.',
        inputSchema: studentSelectorSchema,
    }, async (args) => executeTool(async () => client.getSchedule(args ?? {})));
    registerTool('get_assignments', {
        description: 'Fetch assignment details and scores for a student.',
        inputSchema: assignmentsSchema,
    }, async (args) => executeTool(async () => client.getAssignments(args ?? {})));
    registerTool('get_report_card', {
        description: 'Fetch report card data for a student.',
        inputSchema: reportCardSchema,
    }, async (args) => executeTool(async () => client.getReportCard(args ?? {})));
    server.registerResource('student-profile', 'student://profile', {
        title: 'Student Profile',
        description: 'The default student profile from Infinite Campus.',
        mimeType: 'application/json',
    }, async () => readJsonResource('student://profile', async () => client.getDefaultStudentProfileForResource()));
    server.registerResource('student-grades-current', 'student://grades/current', {
        title: 'Current Grades',
        description: 'Current term grades for the default Infinite Campus student.',
        mimeType: 'application/json',
    }, async () => readJsonResource('student://grades/current', async () => client.getCurrentGradesForResource()));
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
async function executeTool(fn) {
    try {
        const result = await fn();
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (error) {
        const message = error instanceof client_1.InfiniteCampusError ? error.userMessage : 'Could not connect to Infinite Campus — please try again.';
        return {
            content: [{ type: 'text', text: message }],
            isError: true,
        };
    }
}
async function readJsonResource(uri, fn) {
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
    }
    catch (error) {
        const message = error instanceof client_1.InfiniteCampusError ? error.userMessage : 'Could not connect to Infinite Campus — please try again.';
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
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    const { server } = createServer();
    await server.connect(transport);
    console.error('[infinite-campus] MCP server running on stdio');
}
if (require.main === module) {
    main().catch((error) => {
        const message = error instanceof client_1.InfiniteCampusError ? error.userMessage : error instanceof Error ? error.message : 'Unknown startup error';
        console.error(`[infinite-campus] ${message}`);
        process.exit(1);
    });
}
