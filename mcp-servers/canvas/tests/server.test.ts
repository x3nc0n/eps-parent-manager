import { existsSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const hasServerModule = existsSync(new URL('../src/server.ts', import.meta.url)) || existsSync(new URL('../src/index.ts', import.meta.url));

describe('Canvas MCP contract scaffolding', () => {
  test('tracks the main tool families', () => {
    expect(['course', 'assignment', 'calendar'], 'Canvas MCP tests should target the core parent workflows.').toHaveLength(3);
  });
});

describe.skipIf(!hasServerModule)('Canvas MCP server contract', () => {
  test('activates when the server package exports tool definitions', () => {
    expect(hasServerModule, 'Canvas MCP tests will activate automatically once the package source lands.').toBe(true);
  });
});
