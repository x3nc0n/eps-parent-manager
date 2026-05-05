#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export * from "./client.js";
export * from "./types.js";
export declare function createServer(): McpServer;
export declare function main(): Promise<void>;
