import { defineConfig } from 'vitest/config';

const shared = {
  environment: 'node' as const,
  globals: true,
  clearMocks: true,
  restoreMocks: true,
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...shared,
          name: 'root',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'infinite-campus',
          include: ['mcp-servers/infinite-campus/tests/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'canvas',
          include: ['mcp-servers/canvas/tests/**/*.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'google-workspace',
          include: ['mcp-servers/google-workspace/tests/**/*.test.ts'],
        },
      },
    ],
  },
});
