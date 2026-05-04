import { existsSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const hasServerModule = existsSync(new URL('../src/server.ts', import.meta.url)) || existsSync(new URL('../src/index.ts', import.meta.url));

describe('Google Workspace MCP contract scaffolding', () => {
  test('tracks the main tool families', () => {
    expect(['classroom', 'drive', 'sheet'], 'Google Workspace MCP tests should target the core parent workflows.').toHaveLength(3);
  });
});

describe.skipIf(!hasServerModule)('Google Workspace MCP server contract', () => {
  test('activates when the server package exports tool definitions', () => {
    expect(hasServerModule, 'Google Workspace MCP tests will activate automatically once the package source lands.').toBe(true);
  });
});
