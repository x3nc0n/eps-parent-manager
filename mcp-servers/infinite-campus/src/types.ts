export type InfiniteCampusDataSource = 'api' | 'scrape';

export interface InfiniteCampusConfig {
  baseUrl: string;
  username: string;
  password: string;
  loginPath?: string;
  loginPagePath?: string;
  apiBasePath?: string;
  defaultStudentId?: string;
  defaultStudentName?: string;
  sessionTtlMs: number;
}

export interface StudentSelector {
  studentId?: string;
  studentName?: string;
}

export interface StudentProfile extends StudentSelector {
  personId?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  gradeLevel?: string;
  schoolName?: string;
  campusName?: string;
  studentNumber?: string;
  birthDate?: string;
  profilePhotoUrl?: string;
  source: InfiniteCampusDataSource;
  raw?: unknown;
}

export interface GradeEntry {
  courseId?: string;
  sectionId?: string;
  courseName: string;
  teacherName?: string;
  term?: string;
  quarter?: string;
  percent?: number | null;
  score?: number | null;
  letterGrade?: string | null;
  missingAssignments?: number;
  updatedAt?: string;
  comments?: string;
  source: InfiniteCampusDataSource;
  raw?: unknown;
}

export interface GradesSnapshot {
  student: StudentProfile;
  term?: string;
  quarter?: string;
  asOf?: string;
  grades: GradeEntry[];
  source: InfiniteCampusDataSource;
}

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'tardy'
  | 'excused'
  | 'unknown';

export interface AttendanceRecord {
  date: string;
  status: AttendanceStatus;
  period?: string;
  className?: string;
  minutesAbsent?: number;
  excuseCode?: string;
  notes?: string;
  source: InfiniteCampusDataSource;
  raw?: unknown;
}

export interface AttendanceSnapshot {
  student: StudentProfile;
  startDate?: string;
  endDate?: string;
  records: AttendanceRecord[];
  source: InfiniteCampusDataSource;
}

export interface ScheduleEntry {
  period?: string;
  courseName: string;
  room?: string;
  teacherName?: string;
  startTime?: string;
  endTime?: string;
  days?: string[];
  source: InfiniteCampusDataSource;
  raw?: unknown;
}

export interface ScheduleSnapshot {
  student: StudentProfile;
  entries: ScheduleEntry[];
  source: InfiniteCampusDataSource;
}

export interface AssignmentRecord {
  assignmentId?: string;
  courseId?: string;
  courseName: string;
  title: string;
  category?: string;
  dueDate?: string;
  assignedDate?: string;
  score?: number | null;
  pointsPossible?: number | null;
  isMissing?: boolean;
  isLate?: boolean;
  comments?: string;
  source: InfiniteCampusDataSource;
  raw?: unknown;
}

export interface AssignmentsSnapshot {
  student: StudentProfile;
  term?: string;
  assignments: AssignmentRecord[];
  source: InfiniteCampusDataSource;
}

export interface ReportCardCourse {
  courseName: string;
  teacherName?: string;
  term?: string;
  finalPercent?: number | null;
  finalLetterGrade?: string | null;
  comments?: string;
  creditsEarned?: number | null;
  source: InfiniteCampusDataSource;
  raw?: unknown;
}

export interface ReportCardSnapshot {
  student: StudentProfile;
  term?: string;
  issuedAt?: string;
  courses: ReportCardCourse[];
  gpa?: number | null;
  source: InfiniteCampusDataSource;
}

export interface HealthCheckResult {
  ok: boolean;
  message: string;
  baseUrl: string;
  authenticated: boolean;
  studentCount?: number;
}
