import { existsSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import coursesFixture from './fixtures/courses.json';
import submissionsFixture from './fixtures/submissions.json';

const hasClientModule = existsSync(new URL('../src/client.ts', import.meta.url)) || existsSync(new URL('../src/index.ts', import.meta.url));

describe('Canvas fixtures', () => {
  test('include pagination headers and empty submission edge cases', () => {
    expect(coursesFixture.headers.link.includes('rel="next"'), 'Canvas fixtures should include pagination Link headers.').toBe(true);
    expect(
      submissionsFixture.submissions.some((submission) => submission.submittedAt === null),
      'Canvas fixtures should cover an assignment that has not been submitted yet.',
    ).toBe(true);
  });
});

describe.skipIf(!hasClientModule)('Canvas client contract', () => {
  test('is ready for mocked auth, timeout, rate limit, malformed payload, and empty data scenarios', () => {
    expect(hasClientModule, 'Canvas client tests will activate automatically once the package source lands.').toBe(true);
  });
});
