import {
  AssignmentRecord,
  AssignmentsSnapshot,
  AttendanceRecord,
  AttendanceSnapshot,
  AttendanceStatus,
  GradeEntry,
  GradesSnapshot,
  HealthCheckResult,
  InfiniteCampusConfig,
  InfiniteCampusDataSource,
  ReportCardCourse,
  ReportCardSnapshot,
  ScheduleEntry,
  ScheduleSnapshot,
  StudentProfile,
  StudentSelector,
} from './types';

const DEFAULT_SESSION_TTL_MS = 25 * 60 * 1000;
const USER_AGENT = 'eps-parent-manager-infinite-campus-mcp/0.1.0';

const DEFAULT_LOGIN_PAGE_CANDIDATES = [
  '/campus/portal/parents',
  '/campus/portal/students',
  '/campus/portal/login',
];

const DEFAULT_LOGIN_POST_CANDIDATES = [
  '/campus/portal/parents',
  '/campus/portal/students',
  '/campus/login',
  '/campus/verify.jsp',
];

const DEFAULT_API_BASE_CANDIDATES = ['/campus/resources/portal', '/api/portal'];

export class InfiniteCampusError extends Error {
  public readonly userMessage: string;

  public constructor(message: string, userMessage = message, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InfiniteCampusError';
    this.userMessage = userMessage;
  }
}

export class InfiniteCampusClient {
  private readonly config: InfiniteCampusConfig;
  private readonly cookies = new Map<string, string>();
  private lastAuthenticatedAt?: number;
  private loginPromise?: Promise<void>;

  public constructor(config: InfiniteCampusConfig) {
    this.config = {
      ...config,
      baseUrl: stripTrailingSlash(config.baseUrl),
    };
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): InfiniteCampusClient {
    const baseUrl = env.IC_BASE_URL?.trim();
    const username = env.IC_USERNAME?.trim();
    const password = env.IC_PASSWORD?.trim();

    if (!baseUrl || !username || !password) {
      throw new InfiniteCampusError(
        'Missing Infinite Campus environment variables.',
        'Could not connect to Infinite Campus — add IC_BASE_URL, IC_USERNAME, and IC_PASSWORD to your environment.',
      );
    }

    return new InfiniteCampusClient({
      baseUrl,
      username,
      password,
      loginPath: env.IC_LOGIN_PATH?.trim(),
      loginPagePath: env.IC_LOGIN_PAGE_PATH?.trim(),
      apiBasePath: env.IC_API_BASE_PATH?.trim(),
      appName: env.IC_APP_NAME?.trim(),
      portalLoginPage: env.IC_PORTAL_LOGIN_PAGE?.trim(),
      defaultStudentId: env.IC_DEFAULT_STUDENT_ID?.trim(),
      defaultStudentName: env.IC_DEFAULT_STUDENT_NAME?.trim(),
      sessionTtlMs: parsePositiveNumber(env.IC_SESSION_TTL_MS) ?? DEFAULT_SESSION_TTL_MS,
    });
  }

  public async healthCheck(): Promise<HealthCheckResult> {
    await this.ensureAuthenticated();

    let studentCount: number | undefined;
    try {
      studentCount = (await this.getStudents()).length;
    } catch {
      studentCount = undefined;
    }

    return {
      ok: true,
      message:
        typeof studentCount === 'number'
          ? `Connected to Infinite Campus and found ${studentCount} student${studentCount === 1 ? '' : 's'}.`
          : 'Connected to Infinite Campus.',
      baseUrl: this.config.baseUrl,
      authenticated: true,
      studentCount,
    };
  }

  public async getStudents(): Promise<StudentProfile[]> {
    await this.ensureAuthenticated();

    const apiResult = await this.fetchStudentProfilesFromApi();
    if (apiResult.length > 0) {
      return dedupeStudents(apiResult);
    }

    const scrapeResult = await this.fetchStudentProfilesFromPages();
    if (scrapeResult.length > 0) {
      return dedupeStudents(scrapeResult);
    }

    throw new InfiniteCampusError(
      'Unable to find student roster in Infinite Campus responses.',
      'Infinite Campus connected, but no students were found. If you manage multiple students, try setting IC_DEFAULT_STUDENT_ID.',
    );
  }

  public async getStudentProfile(selector: StudentSelector = {}): Promise<StudentProfile> {
    return this.resolveStudent(selector, false);
  }

  public async getGrades(selector: StudentSelector & { term?: string; quarter?: string } = {}): Promise<GradesSnapshot> {
    const student = await this.resolveStudent(selector, false);
    const apiGrades = await this.fetchGradesFromApi(student, selector.term, selector.quarter);

    if (apiGrades.length > 0) {
      return {
        student,
        term: selector.term,
        quarter: selector.quarter,
        asOf: new Date().toISOString(),
        grades: apiGrades,
        source: 'api',
      };
    }

    const scrapedGrades = await this.fetchGradesFromPages(student, selector.term, selector.quarter);
    if (scrapedGrades.length > 0) {
      return {
        student,
        term: selector.term,
        quarter: selector.quarter,
        asOf: new Date().toISOString(),
        grades: scrapedGrades,
        source: 'scrape',
      };
    }

    throw new InfiniteCampusError(
      `Unable to find grade data for student ${student.displayName}.`,
      'Infinite Campus connected, but grades could not be read. The portal layout may have changed and the connector may need updated selectors.',
    );
  }

  public async getAttendance(
    selector: StudentSelector & { startDate?: string; endDate?: string } = {},
  ): Promise<AttendanceSnapshot> {
    const student = await this.resolveStudent(selector, false);
    const apiRecords = await this.fetchAttendanceFromApi(student, selector.startDate, selector.endDate);

    if (apiRecords.length > 0) {
      return {
        student,
        startDate: selector.startDate,
        endDate: selector.endDate,
        records: apiRecords,
        source: 'api',
      };
    }

    const scrapedRecords = await this.fetchAttendanceFromPages(student, selector.startDate, selector.endDate);
    if (scrapedRecords.length > 0) {
      return {
        student,
        startDate: selector.startDate,
        endDate: selector.endDate,
        records: scrapedRecords,
        source: 'scrape',
      };
    }

    throw new InfiniteCampusError(
      `Unable to find attendance data for student ${student.displayName}.`,
      'Infinite Campus connected, but attendance could not be read. The portal layout may have changed and the connector may need updated selectors.',
    );
  }

  public async getSchedule(selector: StudentSelector = {}): Promise<ScheduleSnapshot> {
    const student = await this.resolveStudent(selector, false);
    const apiEntries = await this.fetchScheduleFromApi(student);

    if (apiEntries.length > 0) {
      return {
        student,
        entries: apiEntries,
        source: 'api',
      };
    }

    const scrapedEntries = await this.fetchScheduleFromPages(student);
    if (scrapedEntries.length > 0) {
      return {
        student,
        entries: scrapedEntries,
        source: 'scrape',
      };
    }

    throw new InfiniteCampusError(
      `Unable to find schedule data for student ${student.displayName}.`,
      'Infinite Campus connected, but the class schedule could not be read. The portal layout may have changed and the connector may need updated selectors.',
    );
  }

  public async getAssignments(selector: StudentSelector & { term?: string } = {}): Promise<AssignmentsSnapshot> {
    const student = await this.resolveStudent(selector, false);
    const apiAssignments = await this.fetchAssignmentsFromApi(student, selector.term);

    if (apiAssignments.length > 0) {
      return {
        student,
        term: selector.term,
        assignments: apiAssignments,
        source: 'api',
      };
    }

    const scrapedAssignments = await this.fetchAssignmentsFromPages(student, selector.term);
    if (scrapedAssignments.length > 0) {
      return {
        student,
        term: selector.term,
        assignments: scrapedAssignments,
        source: 'scrape',
      };
    }

    throw new InfiniteCampusError(
      `Unable to find assignment data for student ${student.displayName}.`,
      'Infinite Campus connected, but assignment details could not be read. The portal layout may have changed and the connector may need updated selectors.',
    );
  }

  public async getReportCard(selector: StudentSelector & { term?: string } = {}): Promise<ReportCardSnapshot> {
    const student = await this.resolveStudent(selector, false);
    const apiCourses = await this.fetchReportCardFromApi(student, selector.term);

    if (apiCourses.length > 0) {
      return {
        student,
        term: selector.term,
        issuedAt: new Date().toISOString(),
        courses: apiCourses,
        source: 'api',
      };
    }

    const scrapedCourses = await this.fetchReportCardFromPages(student, selector.term);
    if (scrapedCourses.length > 0) {
      return {
        student,
        term: selector.term,
        issuedAt: new Date().toISOString(),
        courses: scrapedCourses,
        source: 'scrape',
      };
    }

    throw new InfiniteCampusError(
      `Unable to find report card data for student ${student.displayName}.`,
      'Infinite Campus connected, but report card data could not be read. The portal layout may have changed and the connector may need updated selectors.',
    );
  }

  public async getDefaultStudentProfileForResource(): Promise<StudentProfile> {
    return this.resolveStudent({}, true);
  }

  public async getCurrentGradesForResource(): Promise<GradesSnapshot> {
    const student = await this.resolveStudent({}, true);
    return this.getGrades({ studentId: student.studentId, studentName: student.displayName });
  }

  private async resolveStudent(selector: StudentSelector, allowFallbackForResource: boolean): Promise<StudentProfile> {
    const students = await this.getStudents();
    const configuredId = selector.studentId ?? this.config.defaultStudentId;
    const configuredName = selector.studentName ?? this.config.defaultStudentName;

    if (configuredId) {
      const byId = students.find((student) => student.studentId === configuredId || student.personId === configuredId);
      if (byId) {
        return byId;
      }
    }

    if (configuredName) {
      const normalized = normalizeName(configuredName);
      const byName = students.find((student) => normalizeName(student.displayName) === normalized);
      if (byName) {
        return byName;
      }
    }

    if (students.length === 1 || allowFallbackForResource) {
      return students[0];
    }

    throw new InfiniteCampusError(
      'Student selection is ambiguous.',
      'More than one student is available. Please pass studentId or studentName so I know which child to use.',
    );
  }

  private async fetchStudentProfilesFromApi(): Promise<StudentProfile[]> {
    for (const path of this.buildApiPaths(['students', 'studentRoster', 'children'])) {
      const payload = await this.fetchJson(path);
      if (!payload) {
        continue;
      }

      const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['studentId', 'personId', 'studentNumber', 'gradeLevel', 'displayName', 'name']));
      const students = rows.map((row) => this.normalizeStudent(row, 'api')).filter(Boolean) as StudentProfile[];
      if (students.length > 0) {
        return students;
      }
    }

    return [];
  }

  private async fetchStudentProfilesFromPages(): Promise<StudentProfile[]> {
    for (const path of this.buildPortalPaths(['', 'home', 'summary'])) {
      const html = await this.fetchHtml(path || '/campus/portal/parents');
      if (!html) {
        continue;
      }

      const blobs = extractJsonBlobsFromHtml(html);
      const rows = this.findBestObjectArray(blobs, (item) => hasAnyKey(item, ['studentId', 'studentNumber', 'gradeLevel']) && hasAnyKey(item, ['displayName', 'name', 'firstName']));
      const students = rows.map((row) => this.normalizeStudent(row, 'scrape')).filter(Boolean) as StudentProfile[];
      if (students.length > 0) {
        return students;
      }

      // TODO(Data): Replace the fallback regex scraping below with portal-specific selectors from Edmond's IC instance.
      const regexStudents = [...html.matchAll(/data-student-id=["']([^"']+)["'][^>]*data-student-name=["']([^"']+)["']/gi)]
        .map((match) => ({ studentId: match[1], displayName: match[2] }))
        .map((row) => this.normalizeStudent(row, 'scrape'))
        .filter(Boolean) as StudentProfile[];

      if (regexStudents.length > 0) {
        return regexStudents;
      }
    }

    return [];
  }

  private async fetchGradesFromApi(student: StudentProfile, term?: string, quarter?: string): Promise<GradeEntry[]> {
    const query = buildQuery({ studentId: student.studentId, term, quarter });
    const paths = this.buildApiPaths([
      `students/${encodeURIComponent(student.studentId ?? '')}/grades${query}`,
      `grades${query}`,
      `grades/current${query}`,
    ]);

    for (const path of paths) {
      const payload = await this.fetchJson(path);
      if (!payload) {
        continue;
      }

      const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['courseName', 'course', 'className', 'sectionName']) && hasAnyKey(item, ['letterGrade', 'percent', 'score', 'grade']));
      const grades = rows.map((row) => this.normalizeGrade(row, 'api', term, quarter)).filter(Boolean) as GradeEntry[];
      if (grades.length > 0) {
        return grades;
      }
    }

    return [];
  }

  private async fetchGradesFromPages(student: StudentProfile, term?: string, quarter?: string): Promise<GradeEntry[]> {
    const query = buildQuery({ studentId: student.studentId, term, quarter });
    for (const path of this.buildPortalPaths([`grades${query}`, `instruction/grades${query}`])) {
      const html = await this.fetchHtml(path);
      if (!html) {
        continue;
      }

      const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['courseName', 'course', 'sectionName']) && hasAnyKey(item, ['letterGrade', 'percent', 'score', 'grade']));
      const grades = rows.map((row) => this.normalizeGrade(row, 'scrape', term, quarter)).filter(Boolean) as GradeEntry[];
      if (grades.length > 0) {
        return grades;
      }

      // TODO(Data): Replace this row matcher with real HTML selectors once a sample IC grade page is captured.
      const regexGrades = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-letter-grade=["']([^"']*)["'][^>]*data-percent=["']([^"']*)["']/gi)]
        .map((match) => ({ courseName: match[1], letterGrade: match[2], percent: match[3] }))
        .map((row) => this.normalizeGrade(row, 'scrape', term, quarter))
        .filter(Boolean) as GradeEntry[];

      if (regexGrades.length > 0) {
        return regexGrades;
      }
    }

    return [];
  }

  private async fetchAttendanceFromApi(student: StudentProfile, startDate?: string, endDate?: string): Promise<AttendanceRecord[]> {
    const query = buildQuery({ studentId: student.studentId, startDate, endDate });
    for (const path of this.buildApiPaths([`attendance${query}`, `students/${encodeURIComponent(student.studentId ?? '')}/attendance${query}`])) {
      const payload = await this.fetchJson(path);
      if (!payload) {
        continue;
      }

      const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['date', 'eventDate']) && hasAnyKey(item, ['status', 'attendanceStatus', 'present']));
      const records = rows.map((row) => this.normalizeAttendance(row, 'api')).filter(Boolean) as AttendanceRecord[];
      if (records.length > 0) {
        return records;
      }
    }

    return [];
  }

  private async fetchAttendanceFromPages(student: StudentProfile, startDate?: string, endDate?: string): Promise<AttendanceRecord[]> {
    const query = buildQuery({ studentId: student.studentId, startDate, endDate });
    for (const path of this.buildPortalPaths([`attendance${query}`, `instruction/attendance${query}`])) {
      const html = await this.fetchHtml(path);
      if (!html) {
        continue;
      }

      const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['date', 'eventDate']) && hasAnyKey(item, ['status', 'attendanceStatus', 'present']));
      const records = rows.map((row) => this.normalizeAttendance(row, 'scrape')).filter(Boolean) as AttendanceRecord[];
      if (records.length > 0) {
        return records;
      }

      // TODO(Data): Update selectors for Edmond's attendance table markup.
      const regexRecords = [...html.matchAll(/data-date=["']([^"']+)["'][^>]*data-status=["']([^"']+)["']/gi)]
        .map((match) => ({ date: match[1], status: match[2] }))
        .map((row) => this.normalizeAttendance(row, 'scrape'))
        .filter(Boolean) as AttendanceRecord[];

      if (regexRecords.length > 0) {
        return regexRecords;
      }
    }

    return [];
  }

  private async fetchScheduleFromApi(student: StudentProfile): Promise<ScheduleEntry[]> {
    const query = buildQuery({ studentId: student.studentId });
    for (const path of this.buildApiPaths([`schedule${query}`, `students/${encodeURIComponent(student.studentId ?? '')}/schedule`])) {
      const payload = await this.fetchJson(path);
      if (!payload) {
        continue;
      }

      const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['period', 'startTime', 'teacherName']));
      const entries = rows.map((row) => this.normalizeSchedule(row, 'api')).filter(Boolean) as ScheduleEntry[];
      if (entries.length > 0) {
        return entries;
      }
    }

    return [];
  }

  private async fetchScheduleFromPages(student: StudentProfile): Promise<ScheduleEntry[]> {
    const query = buildQuery({ studentId: student.studentId });
    for (const path of this.buildPortalPaths([`schedule${query}`, `instruction/schedule${query}`])) {
      const html = await this.fetchHtml(path);
      if (!html) {
        continue;
      }

      const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['period', 'startTime', 'teacherName']));
      const entries = rows.map((row) => this.normalizeSchedule(row, 'scrape')).filter(Boolean) as ScheduleEntry[];
      if (entries.length > 0) {
        return entries;
      }

      // TODO(Data): Replace fallback regex with table/section scraping when HTML samples are available.
      const regexEntries = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-period=["']([^"']*)["'][^>]*data-teacher=["']([^"']*)["']/gi)]
        .map((match) => ({ courseName: match[1], period: match[2], teacherName: match[3] }))
        .map((row) => this.normalizeSchedule(row, 'scrape'))
        .filter(Boolean) as ScheduleEntry[];

      if (regexEntries.length > 0) {
        return regexEntries;
      }
    }

    return [];
  }

  private async fetchAssignmentsFromApi(student: StudentProfile, term?: string): Promise<AssignmentRecord[]> {
    const query = buildQuery({ studentId: student.studentId, term });
    for (const path of this.buildApiPaths([`assignments${query}`, `students/${encodeURIComponent(student.studentId ?? '')}/assignments${query}`])) {
      const payload = await this.fetchJson(path);
      if (!payload) {
        continue;
      }

      const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['title', 'assignmentName', 'assignment']) && hasAnyKey(item, ['courseName', 'course', 'className']));
      const assignments = rows.map((row) => this.normalizeAssignment(row, 'api')).filter(Boolean) as AssignmentRecord[];
      if (assignments.length > 0) {
        return assignments;
      }
    }

    return [];
  }

  private async fetchAssignmentsFromPages(student: StudentProfile, term?: string): Promise<AssignmentRecord[]> {
    const query = buildQuery({ studentId: student.studentId, term });
    for (const path of this.buildPortalPaths([`assignments${query}`, `instruction/assignments${query}`])) {
      const html = await this.fetchHtml(path);
      if (!html) {
        continue;
      }

      const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['title', 'assignmentName', 'assignment']) && hasAnyKey(item, ['courseName', 'course', 'className']));
      const assignments = rows.map((row) => this.normalizeAssignment(row, 'scrape')).filter(Boolean) as AssignmentRecord[];
      if (assignments.length > 0) {
        return assignments;
      }

      // TODO(Data): Replace fallback regex with actual assignment-card selectors.
      const regexAssignments = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-assignment-title=["']([^"']+)["'][^>]*data-score=["']([^"']*)["']/gi)]
        .map((match) => ({ courseName: match[1], title: match[2], score: match[3] }))
        .map((row) => this.normalizeAssignment(row, 'scrape'))
        .filter(Boolean) as AssignmentRecord[];

      if (regexAssignments.length > 0) {
        return regexAssignments;
      }
    }

    return [];
  }

  private async fetchReportCardFromApi(student: StudentProfile, term?: string): Promise<ReportCardCourse[]> {
    const query = buildQuery({ studentId: student.studentId, term });
    for (const path of this.buildApiPaths([`report-card${query}`, `students/${encodeURIComponent(student.studentId ?? '')}/report-card${query}`, `reportCard${query}`])) {
      const payload = await this.fetchJson(path);
      if (!payload) {
        continue;
      }

      const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['finalLetterGrade', 'letterGrade', 'finalPercent', 'percent']));
      const courses = rows.map((row) => this.normalizeReportCardCourse(row, 'api', term)).filter(Boolean) as ReportCardCourse[];
      if (courses.length > 0) {
        return courses;
      }
    }

    return [];
  }

  private async fetchReportCardFromPages(student: StudentProfile, term?: string): Promise<ReportCardCourse[]> {
    const query = buildQuery({ studentId: student.studentId, term });
    for (const path of this.buildPortalPaths([`report-card${query}`, `instruction/report-card${query}`, `documents/report-card${query}`])) {
      const html = await this.fetchHtml(path);
      if (!html) {
        continue;
      }

      const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['finalLetterGrade', 'letterGrade', 'finalPercent', 'percent']));
      const courses = rows.map((row) => this.normalizeReportCardCourse(row, 'scrape', term)).filter(Boolean) as ReportCardCourse[];
      if (courses.length > 0) {
        return courses;
      }

      // TODO(Data): Replace fallback regex once report-card markup is captured from a real parent portal account.
      const regexCourses = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-final-letter-grade=["']([^"']*)["'][^>]*data-final-percent=["']([^"']*)["']/gi)]
        .map((match) => ({ courseName: match[1], finalLetterGrade: match[2], finalPercent: match[3] }))
        .map((row) => this.normalizeReportCardCourse(row, 'scrape', term))
        .filter(Boolean) as ReportCardCourse[];

      if (regexCourses.length > 0) {
        return regexCourses;
      }
    }

    return [];
  }

  private async ensureAuthenticated(force = false): Promise<void> {
    const sessionIsFresh = !force && this.lastAuthenticatedAt && Date.now() - this.lastAuthenticatedAt < this.config.sessionTtlMs;
    if (sessionIsFresh) {
      return;
    }

    if (!this.loginPromise) {
      this.loginPromise = this.performLogin().finally(() => {
        this.loginPromise = undefined;
      });
    }

    await this.loginPromise;
  }

  private async performLogin(): Promise<void> {
    this.cookies.clear();

    for (const path of this.buildLoginPageCandidates()) {
      await this.rawFetch(path, { method: 'GET' });
    }

    for (const path of this.buildLoginPostCandidates()) {
      for (const loginAttempt of this.buildLoginAttempts()) {
        const response = await this.rawFetch(path, loginAttempt);
        if (await this.isSuccessfulLoginResponse(response)) {
          this.lastAuthenticatedAt = Date.now();
          return;
        }
      }
    }

    throw new InfiniteCampusError(
      'Infinite Campus login failed.',
      'Could not connect to Infinite Campus — check your username and password.',
    );
  }

  private buildLoginAttempts(): RequestInit[] {
    const appName = this.config.appName || 'portal';
    const formFields: Record<string, string> = {
      username: this.config.username,
      password: this.config.password,
      appName,
    };
    if (this.config.portalLoginPage) {
      formFields.portalLoginPage = this.config.portalLoginPage;
    }
    const formPayload = new URLSearchParams(formFields);

    return [
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: formPayload.toString(),
      },
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
        }),
      },
    ];
  }

  private async isSuccessfulLoginResponse(response: Response): Promise<boolean> {
    if (response.status >= 400) {
      return false;
    }

    const location = response.headers.get('location') ?? '';
    if (/login|signin|authenticate/i.test(location)) {
      return false;
    }

    const body = await safeReadText(response);
    if (/invalid|incorrect|unsuccessful/i.test(body) && /password|username|login/i.test(body)) {
      return false;
    }

    if (/name=["']password["']/i.test(body) && /name=["']username["']/i.test(body)) {
      return false;
    }

    return true;
  }

  private async fetchJson(path: string): Promise<unknown | undefined> {
    const response = await this.request(path, {
      method: 'GET',
      headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
    });

    if (response.status === 404) {
      return undefined;
    }

    const text = await safeReadText(response);
    if (!text) {
      return undefined;
    }

    return safeJsonParse(text);
  }

  private async fetchHtml(path: string): Promise<string | undefined> {
    const response = await this.request(path, {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.7' },
    });

    if (response.status === 404) {
      return undefined;
    }

    return safeReadText(response);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response = await this.rawFetch(path, init);

    if (this.isExpiredSessionResponse(response)) {
      this.lastAuthenticatedAt = undefined;
      await this.ensureAuthenticated(true);
      response = await this.rawFetch(path, init);
    }

    return response;
  }

  private isExpiredSessionResponse(response: Response): boolean {
    if (response.status === 401 || response.status === 403) {
      return true;
    }

    const location = response.headers.get('location') ?? '';
    const url = `${response.url} ${location}`;
    return /login|signin|authenticate/i.test(url);
  }

  private async rawFetch(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    headers.set('user-agent', USER_AGENT);

    const cookieHeader = serializeCookies(this.cookies);
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }

    const response = await fetch(this.resolveUrl(path), {
      ...init,
      headers,
      redirect: 'manual',
    });

    storeCookies(this.cookies, response);
    return response;
  }

  private resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return new URL(path.startsWith('/') ? path : `/${path}`, `${this.config.baseUrl}/`).toString();
  }

  private buildApiPaths(paths: string[]): string[] {
    const prefixes = [this.config.apiBasePath?.trim(), ...DEFAULT_API_BASE_CANDIDATES].filter(Boolean) as string[];
    return dedupeStrings(
      paths.flatMap((path) =>
        prefixes.map((prefix) => joinPath(prefix, path)),
      ),
    );
  }

  private buildPortalPaths(paths: string[]): string[] {
    return dedupeStrings(paths.map((path) => joinPath('/campus/portal', path)));
  }

  private buildLoginPageCandidates(): string[] {
    return dedupeStrings([this.config.loginPagePath, ...DEFAULT_LOGIN_PAGE_CANDIDATES].filter(Boolean) as string[]);
  }

  private buildLoginPostCandidates(): string[] {
    return dedupeStrings([this.config.loginPath, ...DEFAULT_LOGIN_POST_CANDIDATES].filter(Boolean) as string[]);
  }

  private findBestObjectArray(source: unknown, predicate: (item: Record<string, unknown>) => boolean): Record<string, unknown>[] {
    const candidates = collectArrays(source)
      .map((array) => array.filter(isRecord))
      .filter((array) => array.length > 0);

    if (isRecord(source)) {
      candidates.push([source]);
    }

    let best: Record<string, unknown>[] = [];
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = candidate.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return bestScore > 0 ? best : [];
  }

  private normalizeStudent(raw: Record<string, unknown>, source: InfiniteCampusDataSource): StudentProfile | undefined {
    const displayName = pickFirstString(raw, ['displayName', 'studentName', 'name'])
      ?? joinName(pickFirstString(raw, ['firstName']), pickFirstString(raw, ['lastName']));

    const studentId = pickFirstString(raw, ['studentId', 'studentID', 'id', 'personID', 'personId', 'studentNumber']);
    if (!displayName || !studentId) {
      return undefined;
    }

    return {
      studentId,
      personId: pickFirstString(raw, ['personId', 'personID']),
      displayName,
      firstName: pickFirstString(raw, ['firstName']),
      lastName: pickFirstString(raw, ['lastName']),
      gradeLevel: pickFirstString(raw, ['gradeLevel', 'grade']),
      schoolName: pickFirstString(raw, ['schoolName', 'school']),
      campusName: pickFirstString(raw, ['campusName', 'campus']),
      studentNumber: pickFirstString(raw, ['studentNumber']),
      birthDate: normalizeDate(pickFirstString(raw, ['birthDate', 'dob'])),
      profilePhotoUrl: pickFirstString(raw, ['profilePhotoUrl', 'photoUrl']),
      source,
      raw,
    };
  }

  private normalizeGrade(
    raw: Record<string, unknown>,
    source: InfiniteCampusDataSource,
    term?: string,
    quarter?: string,
  ): GradeEntry | undefined {
    const courseName = pickFirstString(raw, ['courseName', 'course', 'className', 'sectionName', 'name']);
    if (!courseName) {
      return undefined;
    }

    return {
      courseId: pickFirstString(raw, ['courseId', 'courseID']),
      sectionId: pickFirstString(raw, ['sectionId', 'sectionID']),
      courseName,
      teacherName: pickFirstString(raw, ['teacherName', 'teacher', 'staffName']),
      term: term ?? pickFirstString(raw, ['term', 'termName']),
      quarter: quarter ?? pickFirstString(raw, ['quarter', 'gradingTask']),
      percent: pickFirstNumber(raw, ['percent', 'percentage', 'scorePercent']),
      score: pickFirstNumber(raw, ['score', 'numericScore']),
      letterGrade: pickFirstString(raw, ['letterGrade', 'grade', 'mark']),
      missingAssignments: pickFirstNumber(raw, ['missingAssignments', 'missingCount']),
      updatedAt: normalizeDate(pickFirstString(raw, ['updatedAt', 'lastUpdated'])),
      comments: pickFirstString(raw, ['comments', 'comment']),
      source,
      raw,
    };
  }

  private normalizeAttendance(raw: Record<string, unknown>, source: InfiniteCampusDataSource): AttendanceRecord | undefined {
    const date = normalizeDate(pickFirstString(raw, ['date', 'eventDate']));
    if (!date) {
      return undefined;
    }

    return {
      date,
      status: normalizeAttendanceStatus(raw),
      period: pickFirstString(raw, ['period', 'periodName']),
      className: pickFirstString(raw, ['className', 'courseName', 'course']),
      minutesAbsent: pickFirstNumber(raw, ['minutesAbsent', 'minutes']),
      excuseCode: pickFirstString(raw, ['excuseCode', 'code']),
      notes: pickFirstString(raw, ['notes', 'comment']),
      source,
      raw,
    };
  }

  private normalizeSchedule(raw: Record<string, unknown>, source: InfiniteCampusDataSource): ScheduleEntry | undefined {
    const courseName = pickFirstString(raw, ['courseName', 'course', 'className', 'sectionName']);
    if (!courseName) {
      return undefined;
    }

    return {
      period: pickFirstString(raw, ['period', 'periodName']),
      courseName,
      room: pickFirstString(raw, ['room', 'roomName']),
      teacherName: pickFirstString(raw, ['teacherName', 'teacher', 'staffName']),
      startTime: pickFirstString(raw, ['startTime']),
      endTime: pickFirstString(raw, ['endTime']),
      days: pickStringArray(raw, ['days', 'dayNames']),
      source,
      raw,
    };
  }

  private normalizeAssignment(raw: Record<string, unknown>, source: InfiniteCampusDataSource): AssignmentRecord | undefined {
    const title = pickFirstString(raw, ['title', 'assignmentName', 'assignment']);
    const courseName = pickFirstString(raw, ['courseName', 'course', 'className', 'sectionName']);
    if (!title || !courseName) {
      return undefined;
    }

    return {
      assignmentId: pickFirstString(raw, ['assignmentId', 'assignmentID', 'id']),
      courseId: pickFirstString(raw, ['courseId', 'courseID']),
      courseName,
      title,
      category: pickFirstString(raw, ['category', 'categoryName']),
      dueDate: normalizeDate(pickFirstString(raw, ['dueDate'])),
      assignedDate: normalizeDate(pickFirstString(raw, ['assignedDate'])),
      score: pickFirstNumber(raw, ['score', 'pointsEarned']),
      pointsPossible: pickFirstNumber(raw, ['pointsPossible', 'maxPoints']),
      isMissing: pickFirstBoolean(raw, ['isMissing', 'missing']),
      isLate: pickFirstBoolean(raw, ['isLate', 'late']),
      comments: pickFirstString(raw, ['comments', 'comment']),
      source,
      raw,
    };
  }

  private normalizeReportCardCourse(
    raw: Record<string, unknown>,
    source: InfiniteCampusDataSource,
    term?: string,
  ): ReportCardCourse | undefined {
    const courseName = pickFirstString(raw, ['courseName', 'course', 'className', 'sectionName']);
    if (!courseName) {
      return undefined;
    }

    return {
      courseName,
      teacherName: pickFirstString(raw, ['teacherName', 'teacher', 'staffName']),
      term: term ?? pickFirstString(raw, ['term', 'termName']),
      finalPercent: pickFirstNumber(raw, ['finalPercent', 'percent', 'scorePercent']),
      finalLetterGrade: pickFirstString(raw, ['finalLetterGrade', 'letterGrade', 'grade']),
      comments: pickFirstString(raw, ['comments', 'comment']),
      creditsEarned: pickFirstNumber(raw, ['creditsEarned', 'credits']),
      source,
      raw,
    };
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function serializeCookies(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

function storeCookies(target: Map<string, string>, response: Response): void {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.bind(response.headers);
  const cookieValues = getSetCookie ? getSetCookie() : splitSetCookieHeader(response.headers.get('set-cookie'));

  for (const cookieValue of cookieValues) {
    const [pair] = cookieValue.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (name) {
      target.set(name, value);
    }
  }
}

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(/,(?=[^;,]+=)/g);
}

function joinPath(prefix: string, path: string): string {
  const left = prefix.replace(/\/+$/, '');
  const right = path.replace(/^\/+/, '');
  return right ? `${left}/${right}` : left;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dedupeStudents(students: StudentProfile[]): StudentProfile[] {
  const seen = new Set<string>();
  return students.filter((student) => {
    const key = `${student.studentId}:${normalizeName(student.displayName)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildQuery(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const text = params.toString();
  return text ? `?${text}` : '';
}

function collectArrays(value: unknown): unknown[][] {
  const arrays: unknown[][] = [];

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      arrays.push(current);
      for (const item of current) {
        visit(item);
      }
      return;
    }

    if (isRecord(current)) {
      for (const nested of Object.values(current)) {
        visit(nested);
      }
    }
  };

  visit(value);
  return arrays;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAnyKey(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => key in value && value[key] !== undefined && value[key] !== null);
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function pickFirstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.replace(/[^\d.-]/g, '');
      if (normalized) {
        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

function pickFirstBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(normalized)) {
        return true;
      }
      if (['false', 'no', 'n', '0'].includes(normalized)) {
        return false;
      }
    }
  }

  return undefined;
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) {
        return items;
      }
    }

    if (typeof value === 'string') {
      const items = value.split(/[,/]/g).map((item) => item.trim()).filter(Boolean);
      if (items.length > 0) {
        return items;
      }
    }
  }

  return undefined;
}

function joinName(firstName?: string, lastName?: string): string | undefined {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || undefined;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

function normalizeAttendanceStatus(record: Record<string, unknown>): AttendanceStatus {
  if (typeof record.present === 'boolean') {
    return record.present ? 'present' : 'absent';
  }

  const raw = pickFirstString(record, ['status', 'attendanceStatus', 'state'])?.toLowerCase() ?? '';
  if (raw.includes('present')) {
    return 'present';
  }
  if (raw.includes('excus')) {
    return 'excused';
  }
  if (raw.includes('tardy') || raw.includes('late')) {
    return 'tardy';
  }
  if (raw.includes('absent')) {
    return 'absent';
  }

  return 'unknown';
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function safeJsonParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractJsonBlobsFromHtml(html: string): unknown[] {
  const blobs: unknown[] = [];
  const patterns = [
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/gi,
    /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});/gi,
    /(?:var|let|const)\s+[\w$]+\s*=\s*(\{[\s\S]*?\});/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const parsed = safeJsonParse(match[1].trim().replace(/;$/, ''));
      if (parsed !== undefined) {
        blobs.push(parsed);
      }
    }
  }

  return blobs;
}
