/**
 * Streamer Mode — specification tests
 *
 * These tests define the expected contract for mcp-servers/infinite-campus/src/streamer-mode.ts.
 * Data is building the implementation in parallel. If export names differ, update the import line.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  AssignmentRecord,
  AssignmentsSnapshot,
  AttendanceRecord,
  AttendanceSnapshot,
  GradeEntry,
  GradesSnapshot,
  ScheduleEntry,
  ScheduleSnapshot,
  StudentProfile,
} from '../src/types';
import {
  isStreamerModeEnabled,
  maskAssignmentRecord,
  maskAssignmentsSnapshot,
  maskAttendanceRecord,
  maskAttendanceSnapshot,
  maskGradeEntry,
  maskGradesSnapshot,
  maskScheduleEntry,
  maskScheduleSnapshot,
  maskStudentProfile,
} from '../src/streamer-mode';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_PROFILE: StudentProfile = {
  studentId: 'ic-1001',
  personId: 'p-9876',
  displayName: 'Alex Johnson',
  firstName: 'Alex',
  lastName: 'Johnson',
  gradeLevel: '7',
  schoolName: 'Central Middle School',
  studentNumber: 'SN-4321',
  birthDate: '2012-03-15',
  source: 'api',
};

const ALT_PROFILE: StudentProfile = {
  studentId: 'ic-1002',
  personId: 'p-5555',
  displayName: "Zoë O'Brien",
  firstName: 'Zoë',
  lastName: "O'Brien",
  gradeLevel: '5',
  schoolName: 'Willow Creek Intermediate',
  studentNumber: 'SN-7654',
  birthDate: '2014-07-22',
  source: 'api',
};

const FULL_GRADE: GradeEntry = {
  courseId: 'c-2001',
  sectionId: 's-3001',
  courseName: 'Math 7',
  teacherName: 'Ms. Rivera',
  term: 'Q4',
  percent: 88.4,
  score: 88.4,
  letterGrade: 'B+',
  missingAssignments: 0,
  source: 'api',
};

const ATTENDANCE_RECORD: AttendanceRecord = {
  date: '2026-04-21',
  status: 'tardy',
  period: '2',
  className: 'Math 7',
  minutesAbsent: 8,
  source: 'api',
};

const SCHEDULE_ENTRY: ScheduleEntry = {
  period: '1',
  courseName: 'English Language Arts',
  room: '204',
  teacherName: 'Mr. Chen',
  startTime: '08:00',
  endTime: '08:50',
  days: ['M', 'T', 'W', 'Th', 'F'],
  source: 'api',
};

const ASSIGNMENT_RECORD: AssignmentRecord = {
  assignmentId: 'asgn-9001',
  courseId: 'c-2001',
  courseName: 'Math 7',
  title: 'Chapter 12 Practice Problems',
  category: 'Homework',
  dueDate: '2026-04-28',
  score: 18,
  pointsPossible: 20,
  isMissing: false,
  isLate: false,
  source: 'api',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify a value looks like an obscured ID — not the original, non-empty string. */
function isObscured(value: string | undefined, original: string): void {
  expect(value, `field should be present after masking`).toBeDefined();
  expect(value, `"${original}" should be obscured`).not.toBe(original);
  expect(value!.length, 'obscured value should not be empty').toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// 1. Env var activation
// ---------------------------------------------------------------------------

describe('isStreamerModeEnabled — env var activation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('returns false when no relevant env vars are set', () => {
    vi.unstubAllEnvs();
    delete process.env.STREAMER_MODE;
    delete process.env.EPS_STREAMER_MODE;
    expect(isStreamerModeEnabled()).toBe(false);
  });

  test('STREAMER_MODE=true enables masking', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    expect(isStreamerModeEnabled()).toBe(true);
  });

  test('EPS_STREAMER_MODE=1 enables masking', () => {
    vi.stubEnv('EPS_STREAMER_MODE', '1');
    expect(isStreamerModeEnabled()).toBe(true);
  });

  test('STREAMER_MODE=false disables masking', () => {
    vi.stubEnv('STREAMER_MODE', 'false');
    expect(isStreamerModeEnabled()).toBe(false);
  });

  test('STREAMER_MODE=0 disables masking', () => {
    vi.stubEnv('STREAMER_MODE', '0');
    expect(isStreamerModeEnabled()).toBe(false);
  });

  test('unrecognised value does not enable masking', () => {
    vi.stubEnv('STREAMER_MODE', 'yes');
    expect(isStreamerModeEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Passthrough when streamer mode is OFF
// ---------------------------------------------------------------------------

describe('passthrough when streamer mode is disabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('maskStudentProfile returns profile unchanged when mode is off', () => {
    vi.unstubAllEnvs();
    delete process.env.STREAMER_MODE;
    delete process.env.EPS_STREAMER_MODE;
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.studentId).toBe(FULL_PROFILE.studentId);
    expect(result.lastName).toBe(FULL_PROFILE.lastName);
    expect(result.schoolName).toBe(FULL_PROFILE.schoolName);
  });

  test('maskGradeEntry returns entry unchanged when mode is off', () => {
    vi.unstubAllEnvs();
    delete process.env.STREAMER_MODE;
    delete process.env.EPS_STREAMER_MODE;
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.teacherName).toBe(FULL_GRADE.teacherName);
    expect(result.percent).toBe(FULL_GRADE.percent);
    expect(result.courseId).toBe(FULL_GRADE.courseId);
  });
});

// ---------------------------------------------------------------------------
// 3. StudentProfile masking
// ---------------------------------------------------------------------------

describe('maskStudentProfile — with STREAMER_MODE=true', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('lastName is masked to first character + asterisks matching original length', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.lastName, 'first character should be preserved').toMatch(/^J/);
    expect(result.lastName, 'remaining characters should be asterisks').toMatch(/^J\*+$/);
    expect(result.lastName!.length, 'masked length should equal original length').toBe(FULL_PROFILE.lastName!.length);
  });

  test('firstName is preserved exactly', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.firstName).toBe('Alex');
  });

  test('gradeLevel is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.gradeLevel).toBe('7');
  });

  test('studentId is redacted', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.studentId).not.toBe(FULL_PROFILE.studentId);
  });

  test('personId is redacted', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.personId).not.toBe(FULL_PROFILE.personId);
  });

  test('studentNumber is redacted', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.studentNumber).not.toBe(FULL_PROFILE.studentNumber);
  });

  test('birthDate is masked', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.birthDate).not.toBe(FULL_PROFILE.birthDate);
  });

  test('schoolName becomes "Demo School"', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.schoolName).toBe('Demo School');
  });

  test('displayName contains the first name but not the raw last name', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.displayName).toContain('Alex');
    expect(result.displayName).not.toContain('Johnson');
  });

  test('source is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskStudentProfile(FULL_PROFILE);
    expect(result.source).toBe('api');
  });

  test('raw field is stripped or masked so original data is not leaked', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const profileWithRaw: StudentProfile = { ...FULL_PROFILE, raw: { secretData: 'sensitive' } };
    const result = maskStudentProfile(profileWithRaw);
    expect(JSON.stringify(result)).not.toContain('secretData');
  });
});

// ---------------------------------------------------------------------------
// 4. GradeEntry masking
// ---------------------------------------------------------------------------

describe('maskGradeEntry — with STREAMER_MODE=true', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('courseName is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.courseName).toBe('Math 7');
  });

  test('letterGrade is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.letterGrade).toBe('B+');
  });

  test('term is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.term).toBe('Q4');
  });

  test('teacherName is masked to first character + asterisks', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.teacherName, 'teacher name should not be original').not.toBe('Ms. Rivera');
    expect(result.teacherName, 'teacher name should not contain "Rivera"').not.toContain('Rivera');
  });

  test('percent is obscured but remains a realistic-looking number', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.percent, 'obscured percent should be numeric').toBeTypeOf('number');
    expect(result.percent, 'obscured percent should not equal original').not.toBe(88.4);
    expect(result.percent!, 'obscured percent should be in realistic range (0–100)').toBeGreaterThanOrEqual(0);
    expect(result.percent!, 'obscured percent should be in realistic range (0–100)').toBeLessThanOrEqual(100);
  });

  test('score is obscured but remains numeric', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.score, 'obscured score should be numeric').toBeTypeOf('number');
    expect(result.score, 'obscured score should not equal original').not.toBe(88.4);
  });

  test('courseId is obscured', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    isObscured(result.courseId, 'c-2001');
  });

  test('sectionId is obscured', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    isObscured(result.sectionId, 's-3001');
  });

  test('null percent stays null', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const nullGrade: GradeEntry = { ...FULL_GRADE, percent: null, score: null, letterGrade: null };
    const result = maskGradeEntry(nullGrade);
    expect(result.percent).toBeNull();
    expect(result.score).toBeNull();
    expect(result.letterGrade).toBeNull();
  });

  test('source is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradeEntry(FULL_GRADE);
    expect(result.source).toBe('api');
  });
});

// ---------------------------------------------------------------------------
// 5. AttendanceRecord masking
// ---------------------------------------------------------------------------

describe('maskAttendanceRecord — with STREAMER_MODE=true', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('attendance status is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceRecord(ATTENDANCE_RECORD);
    expect(result.status).toBe('tardy');
  });

  test('date format is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceRecord(ATTENDANCE_RECORD);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('period is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceRecord(ATTENDANCE_RECORD);
    expect(result.period).toBe('2');
  });

  test('className (course name) is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceRecord(ATTENDANCE_RECORD);
    expect(result.className).toBe('Math 7');
  });

  test('source is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceRecord(ATTENDANCE_RECORD);
    expect(result.source).toBe('api');
  });
});

// ---------------------------------------------------------------------------
// 6. ScheduleEntry masking
// ---------------------------------------------------------------------------

describe('maskScheduleEntry — with STREAMER_MODE=true', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('courseName is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleEntry(SCHEDULE_ENTRY);
    expect(result.courseName).toBe('English Language Arts');
  });

  test('period is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleEntry(SCHEDULE_ENTRY);
    expect(result.period).toBe('1');
  });

  test('start/end times are preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleEntry(SCHEDULE_ENTRY);
    expect(result.startTime).toBe('08:00');
    expect(result.endTime).toBe('08:50');
  });

  test('days are preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleEntry(SCHEDULE_ENTRY);
    expect(result.days).toEqual(['M', 'T', 'W', 'Th', 'F']);
  });

  test('teacherName is masked — real name not exposed', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleEntry(SCHEDULE_ENTRY);
    expect(result.teacherName).not.toContain('Chen');
  });

  test('source is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleEntry(SCHEDULE_ENTRY);
    expect(result.source).toBe('api');
  });
});

// ---------------------------------------------------------------------------
// 7. AssignmentRecord masking
// ---------------------------------------------------------------------------

describe('maskAssignmentRecord — with STREAMER_MODE=true', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('assignment title is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentRecord(ASSIGNMENT_RECORD);
    expect(result.title).toBe('Chapter 12 Practice Problems');
  });

  test('courseName is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentRecord(ASSIGNMENT_RECORD);
    expect(result.courseName).toBe('Math 7');
  });

  test('dueDate format is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentRecord(ASSIGNMENT_RECORD);
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('assignmentId is obscured', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentRecord(ASSIGNMENT_RECORD);
    isObscured(result.assignmentId, 'asgn-9001');
  });

  test('courseId is obscured', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentRecord(ASSIGNMENT_RECORD);
    isObscured(result.courseId, 'c-2001');
  });

  test('source is preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentRecord(ASSIGNMENT_RECORD);
    expect(result.source).toBe('api');
  });
});

// ---------------------------------------------------------------------------
// 8. Deterministic masking (consistency within a session)
// ---------------------------------------------------------------------------

describe('deterministic masking — same input yields same output', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('maskStudentProfile produces identical results on repeated calls', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const first = maskStudentProfile(FULL_PROFILE);
    const second = maskStudentProfile(FULL_PROFILE);
    expect(first.lastName).toBe(second.lastName);
    expect(first.studentId).toBe(second.studentId);
    expect(first.personId).toBe(second.personId);
    expect(first.birthDate).toBe(second.birthDate);
  });

  test('maskGradeEntry produces identical results on repeated calls', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const first = maskGradeEntry(FULL_GRADE);
    const second = maskGradeEntry(FULL_GRADE);
    expect(first.percent).toBe(second.percent);
    expect(first.courseId).toBe(second.courseId);
    expect(first.sectionId).toBe(second.sectionId);
  });

  test('two different student profiles produce different masked studentIds', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const maskedA = maskStudentProfile(FULL_PROFILE);
    const maskedB = maskStudentProfile(ALT_PROFILE);
    expect(maskedA.studentId).not.toBe(maskedB.studentId);
  });

  test('two different last names mask to different outputs', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const maskedA = maskStudentProfile(FULL_PROFILE);   // lastName: "Johnson"
    const maskedB = maskStudentProfile(ALT_PROFILE);    // lastName: "O'Brien"
    expect(maskedA.lastName).not.toBe(maskedB.lastName);
  });
});

// ---------------------------------------------------------------------------
// 9. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases — null, undefined, empty, single char', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('minimal StudentProfile with only required fields does not crash', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const minimal: StudentProfile = { displayName: 'Jordan', source: 'scrape' };
    expect(() => maskStudentProfile(minimal)).not.toThrow();
  });

  test('optional fields absent from StudentProfile remain absent after masking', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const minimal: StudentProfile = { displayName: 'Jordan', source: 'scrape' };
    const result = maskStudentProfile(minimal);
    expect(result.studentId).toBeUndefined();
    expect(result.personId).toBeUndefined();
    expect(result.birthDate).toBeUndefined();
    expect(result.studentNumber).toBeUndefined();
  });

  test('single-character last name is masked without error', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const profile: StudentProfile = { ...FULL_PROFILE, lastName: 'X', displayName: 'Alex X' };
    const result = maskStudentProfile(profile);
    expect(result.lastName).toBe('X');  // single char: only char = first char, no asterisks needed
  });

  test('empty lastName string is handled gracefully', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const profile: StudentProfile = { ...FULL_PROFILE, lastName: '' };
    expect(() => maskStudentProfile(profile)).not.toThrow();
    expect(maskStudentProfile(profile).lastName).toBe('');
  });

  test('GradeEntry with no optional fields does not crash', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const minimal: GradeEntry = { courseName: 'PE', source: 'scrape' };
    expect(() => maskGradeEntry(minimal)).not.toThrow();
  });

  test('AttendanceRecord with only required fields does not crash', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const minimal: AttendanceRecord = { date: '2026-05-01', status: 'present', source: 'api' };
    const result = maskAttendanceRecord(minimal);
    expect(result.status).toBe('present');
  });

  test('ScheduleEntry with no teacherName does not crash', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const minimal: ScheduleEntry = { courseName: 'Study Hall', source: 'scrape' };
    expect(() => maskScheduleEntry(minimal)).not.toThrow();
    expect(maskScheduleEntry(minimal).teacherName).toBeUndefined();
  });

  test('null percent and score in GradeEntry do not become numbers after masking', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const noScore: GradeEntry = { courseName: 'Art', source: 'scrape', percent: null, score: null };
    const result = maskGradeEntry(noScore);
    expect(result.percent).toBeNull();
    expect(result.score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Snapshot-level masking
// ---------------------------------------------------------------------------

describe('maskGradesSnapshot — full snapshot masking', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const snapshot: GradesSnapshot = {
    student: FULL_PROFILE,
    term: 'Q4',
    grades: [FULL_GRADE],
    source: 'api',
  };

  test('student PII is masked inside a GradesSnapshot', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradesSnapshot(snapshot);
    expect(result.student.lastName).not.toBe('Johnson');
    expect(result.student.schoolName).toBe('Demo School');
    expect(result.student.studentId).not.toBe('ic-1001');
  });

  test('grade entries are masked inside a GradesSnapshot', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradesSnapshot(snapshot);
    expect(result.grades[0]?.teacherName).not.toContain('Rivera');
    expect(result.grades[0]?.courseId).not.toBe('c-2001');
  });

  test('courseName and letterGrade are preserved inside a GradesSnapshot', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradesSnapshot(snapshot);
    expect(result.grades[0]?.courseName).toBe('Math 7');
    expect(result.grades[0]?.letterGrade).toBe('B+');
  });

  test('term and source are preserved at snapshot level', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskGradesSnapshot(snapshot);
    expect(result.term).toBe('Q4');
    expect(result.source).toBe('api');
  });

  test('GradesSnapshot with empty grades array does not crash', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const empty: GradesSnapshot = { student: FULL_PROFILE, grades: [], source: 'api' };
    expect(() => maskGradesSnapshot(empty)).not.toThrow();
  });
});

describe('maskAttendanceSnapshot — PII masked, statuses preserved', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const snapshot: AttendanceSnapshot = {
    student: FULL_PROFILE,
    records: [ATTENDANCE_RECORD],
    source: 'api',
  };

  test('student PII is masked', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceSnapshot(snapshot);
    expect(result.student.lastName).not.toBe('Johnson');
    expect(result.student.schoolName).toBe('Demo School');
  });

  test('attendance status is preserved on all records', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceSnapshot(snapshot);
    expect(result.records[0]?.status).toBe('tardy');
  });

  test('date format is preserved on records', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceSnapshot(snapshot);
    expect(result.records[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('source is preserved at snapshot level', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAttendanceSnapshot(snapshot);
    expect(result.source).toBe('api');
  });
});

describe('maskScheduleSnapshot — teacher names masked, course names preserved', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const snapshot: ScheduleSnapshot = {
    student: FULL_PROFILE,
    entries: [SCHEDULE_ENTRY],
    source: 'api',
  };

  test('student PII is masked', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleSnapshot(snapshot);
    expect(result.student.lastName).not.toBe('Johnson');
  });

  test('teacher names are masked in schedule entries', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleSnapshot(snapshot);
    expect(result.entries[0]?.teacherName).not.toContain('Chen');
  });

  test('course names are preserved in schedule entries', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleSnapshot(snapshot);
    expect(result.entries[0]?.courseName).toBe('English Language Arts');
  });

  test('source is preserved at snapshot level', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskScheduleSnapshot(snapshot);
    expect(result.source).toBe('api');
  });
});

describe('maskAssignmentsSnapshot — assignment titles and course names preserved', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const snapshot: AssignmentsSnapshot = {
    student: FULL_PROFILE,
    assignments: [ASSIGNMENT_RECORD],
    source: 'api',
  };

  test('student PII is masked', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentsSnapshot(snapshot);
    expect(result.student.schoolName).toBe('Demo School');
  });

  test('assignment titles are preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentsSnapshot(snapshot);
    expect(result.assignments[0]?.title).toBe('Chapter 12 Practice Problems');
  });

  test('course names are preserved', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentsSnapshot(snapshot);
    expect(result.assignments[0]?.courseName).toBe('Math 7');
  });

  test('assignment IDs are obscured', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentsSnapshot(snapshot);
    isObscured(result.assignments[0]?.assignmentId, 'asgn-9001');
  });

  test('source is preserved at snapshot level', () => {
    vi.stubEnv('STREAMER_MODE', 'true');
    const result = maskAssignmentsSnapshot(snapshot);
    expect(result.source).toBe('api');
  });
});
