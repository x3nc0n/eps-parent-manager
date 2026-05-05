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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
exports.main = main;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const client_js_1 = require("./client.js");
__exportStar(require("./client.js"), exports);
__exportStar(require("./types.js"), exports);
const observedUserSchema = zod_1.z.object({
    observedUserId: zod_1.z.string().min(1).optional(),
});
function createServer() {
    const server = new mcp_js_1.McpServer({
        name: "canvas-lms",
        version: "0.1.0",
    });
    server.registerTool("health_check", {
        title: "Canvas Health Check",
        description: "Confirm the Canvas connection, token, and observed-student visibility are working.",
    }, async () => runTool(async () => {
        const client = client_js_1.CanvasClient.fromEnv();
        const result = await client.healthCheck();
        return successResult(result.message, result);
    }));
    server.registerTool("get_courses", {
        title: "Get Canvas Courses",
        description: "List the observed student's enrolled Canvas courses.",
        inputSchema: observedUserSchema,
    }, async ({ observedUserId }) => runTool(async () => {
        const courses = await client_js_1.CanvasClient.fromEnv().getCourses(observedUserId);
        return successResult(`Found ${courses.length} Canvas course(s).`, { courses });
    }));
    server.registerTool("get_assignments", {
        title: "Get Course Assignments",
        description: "Fetch assignments for one Canvas course, including due dates and submission status.",
        inputSchema: observedUserSchema.extend({
            courseId: zod_1.z.string().min(1),
            bucket: zod_1.z.string().min(1).optional(),
        }),
    }, async ({ courseId, observedUserId, bucket }) => runTool(async () => {
        const assignments = await client_js_1.CanvasClient.fromEnv().getAssignments(courseId, { observedUserId, bucket });
        return successResult(`Found ${assignments.length} assignment(s) for course ${courseId}.`, { assignments });
    }));
    server.registerTool("get_all_assignments", {
        title: "Get All Assignments",
        description: "Fetch assignments across all active Canvas courses for the observed student.",
        inputSchema: observedUserSchema,
    }, async ({ observedUserId }) => runTool(async () => {
        const assignments = await client_js_1.CanvasClient.fromEnv().getAllAssignments(observedUserId);
        return successResult(`Found ${assignments.length} assignment(s) across active Canvas courses.`, { assignments });
    }));
    server.registerTool("get_missing_submissions", {
        title: "Get Missing Submissions",
        description: "Fetch missing submittable Canvas assignments, including course context and planner overrides.",
        inputSchema: observedUserSchema,
    }, async ({ observedUserId }) => runTool(async () => {
        const missingSubmissions = await client_js_1.CanvasClient.fromEnv().getMissingSubmissions(observedUserId);
        return successResult(`Found ${missingSubmissions.length} missing submission(s).`, { missingSubmissions });
    }));
    server.registerTool("get_upcoming", {
        title: "Get Upcoming Work",
        description: "Fetch upcoming assignments and calendar events for the next 7-14 days.",
        inputSchema: observedUserSchema.extend({
            days: zod_1.z.number().int().min(1).max(14).optional(),
        }),
    }, async ({ observedUserId, days }) => runTool(async () => {
        const upcoming = await client_js_1.CanvasClient.fromEnv().getUpcoming({ observedUserId, days });
        return successResult(`Found ${upcoming.length} upcoming Canvas item(s).`, { upcoming, days: days ?? 7 });
    }));
    server.registerTool("get_grades", {
        title: "Get Course Grades",
        description: "Fetch current course grades and scores for the observed student.",
        inputSchema: observedUserSchema,
    }, async ({ observedUserId }) => runTool(async () => {
        const grades = await client_js_1.CanvasClient.fromEnv().getGrades(observedUserId);
        return successResult(`Found grade data for ${grades.length} course(s).`, { grades });
    }));
    server.registerTool("get_submissions", {
        title: "Get Assignment Submission",
        description: "Fetch the observed student's submission details for a specific assignment.",
        inputSchema: observedUserSchema.extend({
            courseId: zod_1.z.string().min(1),
            assignmentId: zod_1.z.string().min(1),
        }),
    }, async ({ courseId, assignmentId, observedUserId }) => runTool(async () => {
        const submission = await client_js_1.CanvasClient.fromEnv().getSubmissions(courseId, assignmentId, observedUserId);
        return successResult(`Fetched submission details for assignment ${assignmentId}.`, { submission });
    }));
    server.registerTool("get_syllabus", {
        title: "Get Course Syllabus",
        description: "Fetch a Canvas course syllabus body for the observed student's class.",
        inputSchema: observedUserSchema.extend({
            courseId: zod_1.z.string().min(1),
        }),
    }, async ({ courseId, observedUserId }) => runTool(async () => {
        const syllabus = await client_js_1.CanvasClient.fromEnv().getSyllabus(courseId, observedUserId);
        return successResult(`Fetched syllabus for course ${courseId}.`, { syllabus });
    }));
    server.registerTool("get_modules", {
        title: "Get Course Modules",
        description: "Fetch Canvas course modules and module items for the observed student.",
        inputSchema: observedUserSchema.extend({
            courseId: zod_1.z.string().min(1),
        }),
    }, async ({ courseId, observedUserId }) => runTool(async () => {
        const modules = await client_js_1.CanvasClient.fromEnv().getModules(courseId, observedUserId);
        return successResult(`Found ${modules.length} module(s) for course ${courseId}.`, { modules });
    }));
    server.registerTool("get_calendar", {
        title: "Get Canvas Calendar",
        description: "Fetch calendar events, due dates, and other Canvas schedule items.",
        inputSchema: observedUserSchema.extend({
            days: zod_1.z.number().int().min(1).max(14).optional(),
            includeAllEvents: zod_1.z.boolean().optional(),
        }),
    }, async ({ observedUserId, days, includeAllEvents }) => runTool(async () => {
        const events = await client_js_1.CanvasClient.fromEnv().getCalendar({ observedUserId, days, includeAllEvents });
        return successResult(`Found ${events.length} calendar event(s).`, { events, days: days ?? 7 });
    }));
    server.registerTool("get_announcements", {
        title: "Get Course Announcements",
        description: "Fetch announcements for one course or for all of the observed student's courses.",
        inputSchema: observedUserSchema.extend({
            courseId: zod_1.z.string().min(1).optional(),
            latestOnly: zod_1.z.boolean().optional(),
            activeOnly: zod_1.z.boolean().optional(),
        }),
    }, async ({ observedUserId, courseId, latestOnly, activeOnly }) => runTool(async () => {
        const announcements = await client_js_1.CanvasClient.fromEnv().getAnnouncements({
            observedUserId,
            courseId,
            latestOnly,
            activeOnly,
        });
        return successResult(`Found ${announcements.length} announcement(s).`, { announcements });
    }));
    server.registerResource("canvas-courses", "canvas://courses", {
        title: "Canvas Courses",
        description: "Observed student's enrolled Canvas courses.",
        mimeType: "application/json",
    }, async (uri) => jsonResource(uri.href, async () => ({
        courses: await client_js_1.CanvasClient.fromEnv().getCourses(),
    })));
    server.registerResource("canvas-upcoming-assignments", "canvas://assignments/upcoming", {
        title: "Canvas Upcoming Assignments",
        description: "Upcoming Canvas assignments and events for the next seven days.",
        mimeType: "application/json",
    }, async (uri) => jsonResource(uri.href, async () => ({
        upcoming: await client_js_1.CanvasClient.fromEnv().getUpcoming({ days: 7 }),
    })));
    server.registerResource("canvas-calendar-week", "canvas://calendar/week", {
        title: "Canvas Weekly Calendar",
        description: "Canvas calendar events for the next seven days.",
        mimeType: "application/json",
    }, async (uri) => jsonResource(uri.href, async () => ({
        events: await client_js_1.CanvasClient.fromEnv().getCalendar({ days: 7 }),
    })));
    server.registerPrompt("canvas_weekly_checkin", {
        title: "Canvas Weekly Check-In",
        description: "Guide the model through a parent-friendly weekly Canvas review.",
        argsSchema: {
            studentName: zod_1.z.string().min(1).optional(),
            days: zod_1.z.number().int().min(1).max(14).optional(),
        },
    }, ({ studentName, days }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Review Canvas courses, upcoming work, grades, calendar items, and announcements${studentName ? ` for ${studentName}` : ""}. Start with the Canvas resources, then call the Canvas tools as needed. Focus on the next ${days ?? 7} day(s), highlight missing or late work, and summarize the family-facing next steps in plain language.`,
                },
            },
        ],
    }));
    return server;
}
async function main() {
    const server = createServer();
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
async function runTool(action) {
    try {
        return await action();
    }
    catch (error) {
        const message = friendlyErrorMessage(error);
        return {
            content: [{ type: "text", text: message }],
            isError: true,
        };
    }
}
async function jsonResource(uri, action) {
    try {
        const payload = await action();
        return {
            contents: [
                {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(payload, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            contents: [
                {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify({ error: friendlyErrorMessage(error) }, null, 2),
                },
            ],
        };
    }
}
function successResult(summary, payload) {
    return {
        content: [
            {
                type: "text",
                text: `${summary}\n\n${JSON.stringify(payload, null, 2)}`,
            },
        ],
        structuredContent: payload,
    };
}
function friendlyErrorMessage(error) {
    if (error instanceof client_js_1.CanvasConfigurationError || error instanceof client_js_1.CanvasApiError) {
        return error.message;
    }
    if (error instanceof Error) {
        return `Canvas request failed: ${error.message}`;
    }
    return "Canvas request failed for an unknown reason.";
}
if (require.main === module) {
    main().catch((error) => {
        console.error(friendlyErrorMessage(error));
        process.exitCode = 1;
    });
}
