#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InfiniteCampusClient } from './client';
export * from './client';
export * from './types';
type ToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
};
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
export declare function createClientFromEnv(): InfiniteCampusClient;
export declare function createServer(client?: Pick<InfiniteCampusClient, 'healthCheck' | 'getGrades' | 'getAttendance' | 'getSchedule' | 'getAssignments' | 'getReportCard' | 'getDefaultStudentProfileForResource' | 'getCurrentGradesForResource'>): InfiniteCampusServerHandle;
