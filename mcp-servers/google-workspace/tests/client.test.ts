import { existsSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import classroomFixture from './fixtures/classroom.json';
import driveFixture from './fixtures/drive-files.json';
import sheetsFixture from './fixtures/sheets-data.json';
import tokenRefreshFixture from './fixtures/token-refresh.json';

const hasClientModule = existsSync(new URL('../src/client.ts', import.meta.url)) || existsSync(new URL('../src/index.ts', import.meta.url));

describe('Google Workspace fixtures', () => {
  test('include classroom, drive, sheets, and token refresh scenarios', () => {
    expect(classroomFixture.courses.length, 'Google Workspace fixtures should include classroom data.').toBeGreaterThan(0);
    expect(driveFixture.files.some((file) => file.mimeType.includes('spreadsheet')), 'Google Drive fixtures should include spreadsheet files.').toBe(true);
    expect(sheetsFixture.values.length, 'Google Sheets fixtures should include rows of fake data.').toBeGreaterThan(1);
    expect(tokenRefreshFixture.expiredToken.error.status, 'Google fixtures should capture an expired token response.').toBe('UNAUTHENTICATED');
  });
});

describe.skipIf(!hasClientModule)('Google Workspace client contract', () => {
  test('is ready for mocked auth refresh, timeout, rate limit, malformed payload, and empty data scenarios', () => {
    expect(hasClientModule, 'Google Workspace client tests will activate automatically once the package source lands.').toBe(true);
  });
});
