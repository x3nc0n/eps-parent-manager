"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfiniteCampusClient = exports.InfiniteCampusError = void 0;
const streamer_mode_1 = require("./streamer-mode");
const DEFAULT_SESSION_TTL_MS = 25 * 60 * 1000;
const USER_AGENT = 'eps-parent-manager-infinite-campus-mcp/0.1.0';
const DEFAULT_LOGIN_PAGE_CANDIDATES = [
    '/campus/portal/parents',
    '/campus/portal/students',
    '/campus/portal/login',
];
const DEFAULT_LOGIN_POST_CANDIDATES = [
    '/campus/verify.jsp',
    '/campus/portal/parents',
    '/campus/portal/students',
    '/campus/login',
];
const DEFAULT_API_BASE_CANDIDATES = ['/campus/api/portal', '/campus/resources/portal', '/api/portal'];
const DEFAULT_HOME_PAGE_CANDIDATES = ['/campus/nav-wrapper/parent/portal/parent/home', '/campus/nav-wrapper/parent/portal/parent'];
class InfiniteCampusError extends Error {
    userMessage;
    constructor(message, userMessage = message, options) {
        super(message, options);
        this.name = 'InfiniteCampusError';
        this.userMessage = userMessage;
    }
}
exports.InfiniteCampusError = InfiniteCampusError;
class InfiniteCampusClient {
    config;
    cookies = new Map();
    lastAuthenticatedAt;
    loginPromise;
    streamerMode;
    constructor(config) {
        this.config = {
            ...config,
            baseUrl: stripTrailingSlash(config.baseUrl),
        };
        this.streamerMode = config.streamerMode ?? false;
    }
    static fromEnv(env = process.env) {
        const baseUrl = env.IC_BASE_URL?.trim();
        const username = env.IC_USERNAME?.trim();
        const password = env.IC_PASSWORD?.trim();
        if (!baseUrl || !username || !password) {
            throw new InfiniteCampusError('Missing Infinite Campus environment variables.', 'Could not connect to Infinite Campus — add IC_BASE_URL, IC_USERNAME, and IC_PASSWORD to your environment.');
        }
        const inferredAppName = env.IC_APP_NAME?.trim() || inferAppNameFromBaseUrl(baseUrl);
        return new InfiniteCampusClient({
            baseUrl,
            username,
            password,
            loginPath: env.IC_LOGIN_PATH?.trim(),
            loginPagePath: env.IC_LOGIN_PAGE_PATH?.trim(),
            apiBasePath: env.IC_API_BASE_PATH?.trim(),
            appName: inferredAppName,
            portalLoginPage: env.IC_PORTAL_LOGIN_PAGE?.trim() || inferPortalLoginPage(inferredAppName),
            defaultStudentId: env.IC_DEFAULT_STUDENT_ID?.trim(),
            defaultStudentName: env.IC_DEFAULT_STUDENT_NAME?.trim(),
            sessionTtlMs: parsePositiveNumber(env.IC_SESSION_TTL_MS) ?? DEFAULT_SESSION_TTL_MS,
            streamerMode: (0, streamer_mode_1.isStreamerModeEnabled)(env),
        });
    }
    async healthCheck() {
        await this.ensureAuthenticated();
        let studentCount;
        try {
            studentCount = (await this.getStudents()).length;
        }
        catch {
            studentCount = undefined;
        }
        return {
            ok: true,
            message: typeof studentCount === 'number'
                ? `Connected to Infinite Campus and found ${studentCount} student${studentCount === 1 ? '' : 's'}.`
                : 'Connected to Infinite Campus.',
            baseUrl: this.config.baseUrl,
            authenticated: true,
            studentCount,
        };
    }
    async getStudents() {
        await this.ensureAuthenticated();
        const apiResult = await this.fetchStudentProfilesFromApi();
        if (apiResult.length > 0) {
            return dedupeStudents(apiResult);
        }
        const scrapeResult = await this.fetchStudentProfilesFromPages();
        if (scrapeResult.length > 0) {
            return dedupeStudents(scrapeResult);
        }
        throw new InfiniteCampusError('Unable to find student roster in Infinite Campus responses.', 'Infinite Campus connected, but no students were found. If you manage multiple students, try setting IC_DEFAULT_STUDENT_ID.');
    }
    async getStudentProfile(selector = {}) {
        const profile = await this.resolveStudent(selector, false);
        return this.streamerMode ? (0, streamer_mode_1.maskStudentProfile)(profile) : profile;
    }
    async getGrades(selector = {}) {
        const student = await this.resolveStudent(selector, false);
        const apiGrades = await this.fetchGradesFromApi(student, selector.term, selector.quarter);
        if (apiGrades.length > 0) {
            const snapshot = {
                student,
                term: selector.term,
                quarter: selector.quarter,
                asOf: new Date().toISOString(),
                grades: apiGrades,
                source: 'api',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskGradesSnapshot)(snapshot) : snapshot;
        }
        const scrapedGrades = await this.fetchGradesFromPages(student, selector.term, selector.quarter);
        if (scrapedGrades.length > 0) {
            const snapshot = {
                student,
                term: selector.term,
                quarter: selector.quarter,
                asOf: new Date().toISOString(),
                grades: scrapedGrades,
                source: 'scrape',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskGradesSnapshot)(snapshot) : snapshot;
        }
        throw new InfiniteCampusError(`Unable to find grade data for student ${student.displayName}.`, 'Infinite Campus connected, but grades could not be read. The portal layout may have changed and the connector may need updated selectors.');
    }
    async getAttendance(selector = {}) {
        const student = await this.resolveStudent(selector, false);
        const apiRecords = await this.fetchAttendanceFromApi(student, selector.startDate, selector.endDate);
        if (apiRecords.length > 0) {
            const snapshot = {
                student,
                startDate: selector.startDate,
                endDate: selector.endDate,
                records: apiRecords,
                source: 'api',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskAttendanceSnapshot)(snapshot) : snapshot;
        }
        const scrapedRecords = await this.fetchAttendanceFromPages(student, selector.startDate, selector.endDate);
        if (scrapedRecords.length > 0) {
            const snapshot = {
                student,
                startDate: selector.startDate,
                endDate: selector.endDate,
                records: scrapedRecords,
                source: 'scrape',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskAttendanceSnapshot)(snapshot) : snapshot;
        }
        throw new InfiniteCampusError(`Unable to find attendance data for student ${student.displayName}.`, 'Infinite Campus connected, but attendance could not be read. The portal layout may have changed and the connector may need updated selectors.');
    }
    async getSchedule(selector = {}) {
        const student = await this.resolveStudent(selector, false);
        const apiEntries = await this.fetchScheduleFromApi(student);
        if (apiEntries.length > 0) {
            const snapshot = {
                student,
                entries: apiEntries,
                source: 'api',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskScheduleSnapshot)(snapshot) : snapshot;
        }
        const scrapedEntries = await this.fetchScheduleFromPages(student);
        if (scrapedEntries.length > 0) {
            const snapshot = {
                student,
                entries: scrapedEntries,
                source: 'scrape',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskScheduleSnapshot)(snapshot) : snapshot;
        }
        throw new InfiniteCampusError(`Unable to find schedule data for student ${student.displayName}.`, 'Infinite Campus connected, but the class schedule could not be read. The portal layout may have changed and the connector may need updated selectors.');
    }
    async getAssignments(selector = {}) {
        const student = await this.resolveStudent(selector, false);
        const apiAssignments = await this.fetchAssignmentsFromApi(student, selector.term, selector.filter);
        if (apiAssignments.length > 0) {
            const snapshot = {
                student,
                term: selector.term,
                assignments: apiAssignments,
                source: 'api',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskAssignmentsSnapshot)(snapshot) : snapshot;
        }
        // If filter=missing returned nothing from API, try getting ALL assignments
        // so the caller can reconcile externally (e.g., against Canvas)
        if (selector.filter === 'missing') {
            const allApiAssignments = await this.fetchAssignmentsFromApi(student, selector.term, 'all');
            if (allApiAssignments.length > 0) {
                const snapshot = {
                    student,
                    term: selector.term,
                    assignments: allApiAssignments,
                    source: 'api',
                };
                return this.streamerMode ? (0, streamer_mode_1.maskAssignmentsSnapshot)(snapshot) : snapshot;
            }
        }
        const scrapedAssignments = await this.fetchAssignmentsFromPages(student, selector.term);
        const filteredScraped = selector.filter === 'missing'
            ? scrapedAssignments.filter((a) => a.isMissing === true)
            : scrapedAssignments;
        // If filtering for missing found nothing, return all scraped assignments
        // so the caller has the full picture for reconciliation
        const resultAssignments = (selector.filter === 'missing' && filteredScraped.length === 0)
            ? scrapedAssignments
            : filteredScraped;
        if (resultAssignments.length > 0) {
            const snapshot = {
                student,
                term: selector.term,
                assignments: resultAssignments,
                source: 'scrape',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskAssignmentsSnapshot)(snapshot) : snapshot;
        }
        throw new InfiniteCampusError(`Unable to find assignment data for student ${student.displayName}.`, 'Infinite Campus connected, but assignment details could not be read. The portal layout may have changed and the connector may need updated selectors.');
    }
    async getReportCard(selector = {}) {
        const student = await this.resolveStudent(selector, false);
        const apiCourses = await this.fetchReportCardFromApi(student, selector.term);
        if (apiCourses.length > 0) {
            const snapshot = {
                student,
                term: selector.term,
                issuedAt: new Date().toISOString(),
                courses: apiCourses,
                source: 'api',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskReportCardSnapshot)(snapshot) : snapshot;
        }
        const scrapedCourses = await this.fetchReportCardFromPages(student, selector.term);
        if (scrapedCourses.length > 0) {
            const snapshot = {
                student,
                term: selector.term,
                issuedAt: new Date().toISOString(),
                courses: scrapedCourses,
                source: 'scrape',
            };
            return this.streamerMode ? (0, streamer_mode_1.maskReportCardSnapshot)(snapshot) : snapshot;
        }
        throw new InfiniteCampusError(`Unable to find report card data for student ${student.displayName}.`, 'Infinite Campus connected, but report card data could not be read. The portal layout may have changed and the connector may need updated selectors.');
    }
    async getDefaultStudentProfileForResource() {
        const profile = await this.resolveStudent({}, true);
        return this.streamerMode ? (0, streamer_mode_1.maskStudentProfile)(profile) : profile;
    }
    async getCurrentGradesForResource() {
        const student = await this.resolveStudent({}, true);
        return this.getGrades({ studentId: student.studentId, studentName: student.displayName });
    }
    async resolveStudent(selector, allowFallbackForResource) {
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
        throw new InfiniteCampusError('Student selection is ambiguous.', 'More than one student is available. Please pass studentId or studentName so I know which child to use.');
    }
    async fetchStudentProfilesFromApi() {
        for (const path of this.buildApiPaths(['students', 'studentRoster', 'children'])) {
            const payload = await this.fetchJson(path);
            if (!payload) {
                continue;
            }
            const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['studentId', 'personId', 'studentNumber', 'gradeLevel', 'displayName', 'name']));
            const students = rows.map((row) => this.normalizeStudent(row, 'api')).filter(Boolean);
            if (students.length > 0) {
                return students;
            }
        }
        return [];
    }
    async fetchStudentProfilesFromPages() {
        for (const path of dedupeStrings([...this.buildPortalPaths(['', 'home', 'summary']), ...this.buildHomePageCandidates()])) {
            const html = await this.fetchHtml(path || '/campus/portal/parents');
            if (!html) {
                continue;
            }
            const blobs = extractJsonBlobsFromHtml(html);
            const rows = this.findBestObjectArray(blobs, (item) => hasAnyKey(item, ['studentId', 'studentNumber', 'gradeLevel']) && hasAnyKey(item, ['displayName', 'name', 'firstName']));
            const students = rows.map((row) => this.normalizeStudent(row, 'scrape')).filter(Boolean);
            if (students.length > 0) {
                return students;
            }
            const regexStudents = [...html.matchAll(/data-student-id=["']([^"']+)["'][^>]*data-student-name=["']([^"']+)["']/gi)]
                .map((match) => ({ studentId: match[1], displayName: match[2] }))
                .map((row) => this.normalizeStudent(row, 'scrape'))
                .filter(Boolean);
            if (regexStudents.length > 0) {
                return regexStudents;
            }
        }
        return [];
    }
    async fetchGradesFromApi(student, term, quarter) {
        const personId = this.getStudentPersonId(student);
        const paths = dedupeStrings([
            personId ? `/campus/resources/portal/grades${buildQuery({ personID: personId, term, quarter })}` : '',
            ...this.buildApiPaths([
                `students/${encodeURIComponent(student.studentId ?? '')}/grades${buildQuery({ studentId: student.studentId, term, quarter })}`,
                `grades${buildQuery({ personID: personId, studentId: student.studentId, term, quarter })}`,
                `grades/current${buildQuery({ personID: personId, studentId: student.studentId, term, quarter })}`,
            ]),
        ]);
        for (const path of paths) {
            const payload = await this.fetchJson(path);
            if (!payload) {
                continue;
            }
            const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['courseName', 'course', 'className', 'sectionName']) && hasAnyKey(item, ['letterGrade', 'percent', 'score', 'grade']));
            const grades = rows.map((row) => this.normalizeGrade(row, 'api', term, quarter)).filter(Boolean);
            if (grades.length > 0) {
                return grades;
            }
        }
        return [];
    }
    async fetchGradesFromPages(student, term, quarter) {
        const query = buildQuery({ personID: this.getStudentPersonId(student), studentId: student.studentId, term, quarter });
        const paths = dedupeStrings([...this.buildPortalPaths([`grades${query}`, `instruction/grades${query}`]), ...this.buildHomePageCandidates()]);
        for (const path of paths) {
            const html = await this.fetchHtml(path);
            if (!html) {
                continue;
            }
            const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['courseName', 'course', 'sectionName']) && hasAnyKey(item, ['letterGrade', 'percent', 'score', 'grade']));
            const grades = rows.map((row) => this.normalizeGrade(row, 'scrape', term, quarter)).filter(Boolean);
            if (grades.length > 0) {
                return grades;
            }
            const selectorGrades = extractPortalNotifications(html)
                .map((notification) => parseGradeNotification(notification, student, term, quarter))
                .filter(Boolean);
            if (selectorGrades.length > 0) {
                return selectorGrades;
            }
            const regexGrades = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-letter-grade=["']([^"']*)["'][^>]*data-percent=["']([^"']*)["']/gi)]
                .map((match) => ({ courseName: match[1], letterGrade: match[2], percent: match[3] }))
                .map((row) => this.normalizeGrade(row, 'scrape', term, quarter))
                .filter(Boolean);
            if (regexGrades.length > 0) {
                return regexGrades;
            }
        }
        return [];
    }
    async fetchAttendanceFromApi(student, startDate, endDate) {
        const personId = this.getStudentPersonId(student);
        const enrollmentId = this.getPrimaryEnrollmentId(student);
        const paths = dedupeStrings([
            personId
                ? `/campus/resources/portal/attendance/events${buildQuery({ personID: personId, enrollmentID: enrollmentId, startDate, endDate })}`
                : '',
            ...this.buildApiPaths([
                `attendance${buildQuery({ personID: personId, enrollmentID: enrollmentId, studentId: student.studentId, startDate, endDate })}`,
                `students/${encodeURIComponent(student.studentId ?? '')}/attendance${buildQuery({ studentId: student.studentId, startDate, endDate })}`,
            ]),
        ]);
        for (const path of paths) {
            const payload = await this.fetchJson(path);
            if (!payload) {
                continue;
            }
            const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['date', 'eventDate']) && hasAnyKey(item, ['status', 'attendanceStatus', 'present']));
            const records = rows.map((row) => this.normalizeAttendance(row, 'api')).filter(Boolean);
            if (records.length > 0) {
                return records;
            }
        }
        return [];
    }
    async fetchAttendanceFromPages(student, startDate, endDate) {
        const query = buildQuery({ personID: this.getStudentPersonId(student), studentId: student.studentId, startDate, endDate });
        const paths = dedupeStrings([...this.buildPortalPaths([`attendance${query}`, `instruction/attendance${query}`]), ...this.buildHomePageCandidates()]);
        for (const path of paths) {
            const html = await this.fetchHtml(path);
            if (!html) {
                continue;
            }
            const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['date', 'eventDate']) && hasAnyKey(item, ['status', 'attendanceStatus', 'present']));
            const records = rows.map((row) => this.normalizeAttendance(row, 'scrape')).filter(Boolean);
            if (records.length > 0) {
                return records;
            }
            const selectorRecords = extractPortalNotifications(html)
                .map((notification) => parseAttendanceNotification(notification, student))
                .filter(Boolean);
            if (selectorRecords.length > 0) {
                return selectorRecords;
            }
            const regexRecords = [...html.matchAll(/data-date=["']([^"']+)["'][^>]*data-status=["']([^"']+)["']/gi)]
                .map((match) => ({ date: match[1], status: match[2] }))
                .map((row) => this.normalizeAttendance(row, 'scrape'))
                .filter(Boolean);
            if (regexRecords.length > 0) {
                return regexRecords;
            }
        }
        return [];
    }
    async fetchScheduleFromApi(student) {
        const personId = this.getStudentPersonId(student);
        const today = new Date().toISOString().slice(0, 10);
        const paths = dedupeStrings([
            personId ? `/campus/api/portal/plan${buildQuery({ personID: personId })}` : '',
            personId ? `/campus/resources/portal/dayEvent/byEnrollment${buildQuery({ personID: personId, date: today })}` : '',
            ...this.buildApiPaths([
                `schedule${buildQuery({ personID: personId, studentId: student.studentId })}`,
                `students/${encodeURIComponent(student.studentId ?? '')}/schedule`,
            ]),
        ]);
        for (const path of paths) {
            const payload = await this.fetchJson(path);
            if (!payload) {
                continue;
            }
            const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['period', 'startTime', 'teacherName']));
            const entries = rows.map((row) => this.normalizeSchedule(row, 'api')).filter(Boolean);
            if (entries.length > 0) {
                return entries;
            }
        }
        return [];
    }
    async fetchScheduleFromPages(student) {
        const query = buildQuery({ personID: this.getStudentPersonId(student), studentId: student.studentId });
        for (const path of this.buildPortalPaths([`schedule${query}`, `instruction/schedule${query}`])) {
            const html = await this.fetchHtml(path);
            if (!html) {
                continue;
            }
            const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['period', 'startTime', 'teacherName']));
            const entries = rows.map((row) => this.normalizeSchedule(row, 'scrape')).filter(Boolean);
            if (entries.length > 0) {
                return entries;
            }
            const regexEntries = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-period=["']([^"']*)["'][^>]*data-teacher=["']([^"']*)["']/gi)]
                .map((match) => ({ courseName: match[1], period: match[2], teacherName: match[3] }))
                .map((row) => this.normalizeSchedule(row, 'scrape'))
                .filter(Boolean);
            if (regexEntries.length > 0) {
                return regexEntries;
            }
        }
        return [];
    }
    async fetchAssignmentsFromApi(student, term, filter) {
        const personId = this.getStudentPersonId(student);
        const today = new Date().toISOString().slice(0, 10);
        // IC's /assignment/missing*, /assignment/*Total, /assignment/byDateRangeTotal, etc.
        // all return only counts (numbers), not assignment objects.
        // The actual assignment data comes from the generic assignment list endpoints
        // or from the grades detail view. We try those and post-filter for missing if needed.
        const paths = dedupeStrings([
            ...this.buildApiPaths([
                `assignments${buildQuery({ personID: personId, studentId: student.studentId, term })}`,
                `students/${encodeURIComponent(student.studentId ?? '')}/assignments${buildQuery({ studentId: student.studentId, term })}`,
            ]),
            // Some IC portals expose assignment data through the grades detail endpoint
            personId ? `/campus/resources/portal/grades${buildQuery({ personID: personId, term })}` : '',
            personId ? `/campus/api/portal/grades${buildQuery({ personID: personId, term })}` : '',
        ]);
        for (const path of paths) {
            const payload = await this.fetchJson(path);
            if (!payload) {
                continue;
            }
            // Skip responses that are just a number (count-only endpoints)
            if (typeof payload === 'number' || (typeof payload === 'string' && /^\d+$/.test(payload.trim()))) {
                continue;
            }
            const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['title', 'assignmentName', 'assignment']) && hasAnyKey(item, ['courseName', 'course', 'className', 'sectionName']));
            let assignments = rows.map((row) => this.normalizeAssignment(row, 'api')).filter(Boolean);
            if (assignments.length > 0) {
                if (filter === 'missing') {
                    const missingOnly = assignments.filter((a) => a.isMissing === true);
                    return missingOnly;
                }
                return assignments;
            }
        }
        return [];
    }
    async fetchAssignmentsFromPages(student, term) {
        const query = buildQuery({ personID: this.getStudentPersonId(student), studentId: student.studentId, term });
        const paths = dedupeStrings([...this.buildPortalPaths([`assignments${query}`, `instruction/assignments${query}`]), ...this.buildHomePageCandidates()]);
        for (const path of paths) {
            const html = await this.fetchHtml(path);
            if (!html) {
                continue;
            }
            const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['title', 'assignmentName', 'assignment']) && hasAnyKey(item, ['courseName', 'course', 'className', 'sectionName']));
            const assignments = rows.map((row) => this.normalizeAssignment(row, 'scrape')).filter(Boolean);
            if (assignments.length > 0) {
                return assignments;
            }
            const selectorAssignments = extractPortalNotifications(html)
                .map((notification) => parseAssignmentNotification(notification, student))
                .filter(Boolean);
            if (selectorAssignments.length > 0) {
                return selectorAssignments;
            }
            // Try parsing assignment rows with status badges (Missing/Late tags)
            const badgeAssignments = extractAssignmentRowsWithBadges(html);
            if (badgeAssignments.length > 0) {
                return badgeAssignments;
            }
            const regexAssignments = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-assignment-title=["']([^"']+)["'][^>]*data-score=["']([^"']*)["']/gi)]
                .map((match) => ({ courseName: match[1], title: match[2], score: match[3] }))
                .map((row) => this.normalizeAssignment(row, 'scrape'))
                .filter(Boolean);
            if (regexAssignments.length > 0) {
                return regexAssignments;
            }
        }
        return [];
    }
    async fetchReportCardFromApi(student, term) {
        const query = buildQuery({ studentId: student.studentId, term });
        for (const path of this.buildApiPaths([`report-card${query}`, `students/${encodeURIComponent(student.studentId ?? '')}/report-card${query}`, `reportCard${query}`])) {
            const payload = await this.fetchJson(path);
            if (!payload) {
                continue;
            }
            const rows = this.findBestObjectArray(payload, (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['finalLetterGrade', 'letterGrade', 'finalPercent', 'percent']));
            const courses = rows.map((row) => this.normalizeReportCardCourse(row, 'api', term)).filter(Boolean);
            if (courses.length > 0) {
                return courses;
            }
        }
        return [];
    }
    async fetchReportCardFromPages(student, term) {
        const query = buildQuery({ studentId: student.studentId, term });
        for (const path of this.buildPortalPaths([`report-card${query}`, `instruction/report-card${query}`, `documents/report-card${query}`])) {
            const html = await this.fetchHtml(path);
            if (!html) {
                continue;
            }
            const rows = this.findBestObjectArray(extractJsonBlobsFromHtml(html), (item) => hasAnyKey(item, ['courseName', 'course', 'className']) && hasAnyKey(item, ['finalLetterGrade', 'letterGrade', 'finalPercent', 'percent']));
            const courses = rows.map((row) => this.normalizeReportCardCourse(row, 'scrape', term)).filter(Boolean);
            if (courses.length > 0) {
                return courses;
            }
            const regexCourses = [...html.matchAll(/data-course-name=["']([^"']+)["'][^>]*data-final-letter-grade=["']([^"']*)["'][^>]*data-final-percent=["']([^"']*)["']/gi)]
                .map((match) => ({ courseName: match[1], finalLetterGrade: match[2], finalPercent: match[3] }))
                .map((row) => this.normalizeReportCardCourse(row, 'scrape', term))
                .filter(Boolean);
            if (regexCourses.length > 0) {
                return regexCourses;
            }
        }
        return [];
    }
    async ensureAuthenticated(force = false) {
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
    async performLogin() {
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
        throw new InfiniteCampusError('Infinite Campus login failed.', 'Could not connect to Infinite Campus — check your username and password.');
    }
    buildLoginAttempts() {
        const appName = this.config.appName || 'portal';
        const districtLoginPage = appName !== 'portal' ? buildDistrictPortalLoginPath(appName) : undefined;
        const portalLoginPage = this.config.portalLoginPage || inferPortalLoginPage(appName);
        const formFields = {
            username: this.config.username,
            password: this.config.password,
            appName,
            url: 'nav-wrapper',
            lang: 'en',
        };
        if (districtLoginPage) {
            formFields.portalUrl = districtLoginPage.replace(/^\//, '');
        }
        if (portalLoginPage) {
            formFields.portalLoginPage = portalLoginPage;
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
    async isSuccessfulLoginResponse(response) {
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
    async fetchJson(path) {
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
    async fetchHtml(path) {
        const response = await this.request(path, {
            method: 'GET',
            headers: { accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.7' },
        });
        if (response.status === 404) {
            return undefined;
        }
        return safeReadText(response);
    }
    async request(path, init) {
        let response = await this.rawFetch(path, init);
        if (this.isExpiredSessionResponse(response)) {
            this.lastAuthenticatedAt = undefined;
            await this.ensureAuthenticated(true);
            response = await this.rawFetch(path, init);
        }
        return response;
    }
    isExpiredSessionResponse(response) {
        if (response.status === 401 || response.status === 403) {
            return true;
        }
        const location = response.headers.get('location') ?? '';
        const url = `${response.url} ${location}`;
        return /login|signin|authenticate/i.test(url);
    }
    async rawFetch(path, init) {
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
    resolveUrl(path) {
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        return new URL(path.startsWith('/') ? path : `/${path}`, `${this.config.baseUrl}/`).toString();
    }
    buildApiPaths(paths) {
        const prefixes = [this.config.apiBasePath?.trim(), ...DEFAULT_API_BASE_CANDIDATES].filter(Boolean);
        return dedupeStrings(paths.flatMap((path) => prefixes.map((prefix) => joinPath(prefix, path))));
    }
    buildPortalPaths(paths) {
        return dedupeStrings(paths.map((path) => joinPath('/campus/portal', path)));
    }
    buildLoginPageCandidates() {
        const districtLoginPages = this.config.appName ? [buildDistrictPortalLoginPath(this.config.appName, 'parents')] : [];
        return dedupeStrings([this.config.loginPagePath, ...districtLoginPages, ...DEFAULT_LOGIN_PAGE_CANDIDATES].filter(Boolean));
    }
    buildLoginPostCandidates() {
        return dedupeStrings([this.config.loginPath, ...DEFAULT_LOGIN_POST_CANDIDATES].filter(Boolean));
    }
    buildHomePageCandidates() {
        return DEFAULT_HOME_PAGE_CANDIDATES;
    }
    getStudentPersonId(student) {
        return student.personId ?? student.studentId;
    }
    getPrimaryEnrollmentId(student) {
        return getPrimaryEnrollment(student.raw)?.enrollmentID;
    }
    findBestObjectArray(source, predicate) {
        const candidates = collectArrays(source)
            .map((array) => array.filter(isRecord))
            .filter((array) => array.length > 0);
        if (isRecord(source)) {
            candidates.push([source]);
        }
        let best = [];
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
    normalizeStudent(raw, source) {
        const displayName = pickFirstString(raw, ['displayName', 'studentName', 'name'])
            ?? joinName(pickFirstString(raw, ['firstName']), pickFirstString(raw, ['lastName']));
        const studentId = pickFirstText(raw, ['studentId', 'studentID', 'id', 'personID', 'personId', 'studentNumber']);
        if (!displayName || !studentId) {
            return undefined;
        }
        const primaryEnrollment = getPrimaryEnrollment(raw);
        const personId = pickFirstText(raw, ['personId', 'personID']) ?? studentId;
        return {
            studentId,
            personId,
            displayName,
            firstName: pickFirstString(raw, ['firstName']),
            lastName: pickFirstString(raw, ['lastName']),
            gradeLevel: pickFirstString(raw, ['gradeLevel', 'grade']) ?? primaryEnrollment?.grade,
            schoolName: pickFirstString(raw, ['schoolName', 'school']) ?? primaryEnrollment?.schoolName,
            campusName: pickFirstString(raw, ['campusName', 'campus']) ?? primaryEnrollment?.calendarName ?? primaryEnrollment?.structureName,
            studentNumber: pickFirstString(raw, ['studentNumber']),
            birthDate: normalizeDate(pickFirstString(raw, ['birthDate', 'dob'])),
            profilePhotoUrl: pickFirstString(raw, ['profilePhotoUrl', 'photoUrl']) ?? buildPersonPicturePath(personId),
            source,
            raw,
        };
    }
    normalizeGrade(raw, source, term, quarter) {
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
    normalizeAttendance(raw, source) {
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
    normalizeSchedule(raw, source) {
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
    normalizeAssignment(raw, source) {
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
    normalizeReportCardCourse(raw, source, term) {
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
exports.InfiniteCampusClient = InfiniteCampusClient;
function stripTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
function parsePositiveNumber(value) {
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
function serializeCookies(cookies) {
    return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}
function storeCookies(target, response) {
    const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
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
function splitSetCookieHeader(value) {
    if (!value) {
        return [];
    }
    return value.split(/,(?=[^;,]+=)/g);
}
function joinPath(prefix, path) {
    const left = prefix.replace(/\/+$/, '');
    const right = path.replace(/^\/+/, '');
    return right ? `${left}/${right}` : left;
}
function dedupeStrings(values) {
    return [...new Set(values.filter(Boolean))];
}
function dedupeStudents(students) {
    const seen = new Set();
    return students.filter((student) => {
        const key = `${student.studentId}:${normalizeName(student.displayName)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function buildQuery(values) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value) {
            params.set(key, value);
        }
    }
    const text = params.toString();
    return text ? `?${text}` : '';
}
function collectArrays(value) {
    const arrays = [];
    const visit = (current) => {
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
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasAnyKey(value, keys) {
    return keys.some((key) => key in value && value[key] !== undefined && value[key] !== null);
}
function pickFirstString(record, keys) {
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
function pickFirstText(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string') {
            const normalized = value.trim();
            if (normalized) {
                return normalized;
            }
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }
    }
    return undefined;
}
function pickFirstNumber(record, keys) {
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
function pickFirstBoolean(record, keys) {
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
function pickStringArray(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) {
            const items = value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
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
function joinName(firstName, lastName) {
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    return name || undefined;
}
function normalizeDate(value) {
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
function normalizeAttendanceStatus(record) {
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
function normalizeName(value) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
async function safeReadText(response) {
    try {
        return await response.text();
    }
    catch {
        return '';
    }
}
function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function extractJsonBlobsFromHtml(html) {
    const blobs = [];
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
function inferAppNameFromBaseUrl(baseUrl) {
    try {
        const pathname = new URL(baseUrl).pathname;
        const match = pathname.match(/\/campus\/portal\/(?:parents|students)\/([^/]+)\.jsp$/i);
        return match?.[1];
    }
    catch {
        return undefined;
    }
}
function inferPortalLoginPage(appName) {
    return appName && appName !== 'portal' ? `${appName}.jsp` : undefined;
}
function buildDistrictPortalLoginPath(appName, audience = 'parents') {
    return `/campus/portal/${audience}/${appName}.jsp`;
}
function buildPersonPicturePath(personId) {
    return personId ? `/campus/personPicture.jsp?personID=${encodeURIComponent(personId)}` : undefined;
}
function getPrimaryEnrollment(raw) {
    if (!isRecord(raw)) {
        return undefined;
    }
    const enrollments = raw.enrollments;
    if (!Array.isArray(enrollments)) {
        return undefined;
    }
    const current = enrollments.find((entry) => isRecord(entry) && entry.showOnPortal === true);
    const enrollment = isRecord(current) ? current : enrollments.find(isRecord);
    if (!enrollment) {
        return undefined;
    }
    return {
        enrollmentID: pickFirstText(enrollment, ['enrollmentID', 'enrollmentId', 'id']),
        grade: pickFirstString(enrollment, ['grade']),
        schoolName: pickFirstString(enrollment, ['schoolName']),
        calendarName: pickFirstString(enrollment, ['calendarName']),
        structureName: pickFirstString(enrollment, ['structureName']),
    };
}
/**
 * Extract assignment rows from IC portal HTML that use status badges (Missing/Late/etc).
 * IC portals render assignment lists with various structures — this catches rows that have
 * both a course/class identifier and an assignment name, optionally with a status badge.
 */
function extractAssignmentRowsWithBadges(html) {
    const assignments = [];
    // Pattern 1: Table/list rows with class="missing" or text "Missing" near assignment info
    // Matches structures like: <tr>...<td>Course Name</td>...<td>Assignment Title</td>...<span>Missing</span>...</tr>
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    for (const rowMatch of html.matchAll(rowPattern)) {
        const row = rowMatch[1];
        // Look for cells/spans that indicate this row has assignment data
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanHtmlText(m[1]) ?? '');
        if (cells.length < 2) {
            continue;
        }
        // Check for missing/late badge in the row
        const hasMissing = /\bmissing\b/i.test(row);
        const hasLate = /\blate\b/i.test(row);
        if (!hasMissing && !hasLate) {
            continue;
        }
        // Try to identify course and assignment from cell content
        // Heuristic: the longer cell content is likely the assignment title, shorter is course
        const nonEmptyCells = cells.filter((c) => c.length > 0);
        if (nonEmptyCells.length < 2) {
            continue;
        }
        // Look for a date-like cell to use as due date
        const dateCell = nonEmptyCells.find((c) => /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/.test(c));
        const contentCells = nonEmptyCells.filter((c) => c !== dateCell && !/^\d+(\.\d+)?$/.test(c));
        if (contentCells.length >= 2) {
            assignments.push({
                courseName: contentCells[0],
                title: contentCells[1],
                dueDate: dateCell ? normalizeDate(dateCell) : undefined,
                isMissing: hasMissing,
                isLate: hasLate,
                source: 'scrape',
                raw: { cells, html: rowMatch[0].slice(0, 500) },
            });
        }
    }
    // Pattern 2: IC Campus portal card/tile layout with assignment-flag badges
    // <div class="assignment-row">...<span class="assignment-flag--missing">Missing</span>...
    const cardPattern = /<(?:div|li)[^>]*class="[^"]*assignment[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi;
    for (const cardMatch of html.matchAll(cardPattern)) {
        const card = cardMatch[1];
        const hasMissing = /\bmissing\b/i.test(card);
        const hasLate = /\blate\b/i.test(card);
        if (!hasMissing && !hasLate) {
            continue;
        }
        const titleMatch = card.match(/<[^>]*class="[^"]*(?:assignment[_-]?(?:name|title)|title)[^"]*"[^>]*>([\s\S]*?)<\//i);
        const courseMatch = card.match(/<[^>]*class="[^"]*(?:course[_-]?name|section[_-]?name|class[_-]?name)[^"]*"[^>]*>([\s\S]*?)<\//i);
        const dateMatch = card.match(/(?:due|date)[^>]*>([\s\S]*?)<\//i);
        const title = cleanHtmlText(titleMatch?.[1]);
        const courseName = cleanHtmlText(courseMatch?.[1]);
        if (title && courseName) {
            assignments.push({
                courseName,
                title,
                dueDate: dateMatch ? normalizeDate(cleanHtmlText(dateMatch[1]) ?? '') : undefined,
                isMissing: hasMissing,
                isLate: hasLate,
                source: 'scrape',
                raw: { html: cardMatch[0].slice(0, 500) },
            });
        }
    }
    return assignments;
}
function extractPortalNotifications(html) {
    return [...html.matchAll(/<div[^>]*class="notification__text__container"[^>]*>[\s\S]*?<a[^>]*class="[^"]*notification__text[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*class="[^"]*notification__date[^"]*"[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<\/div>/gi)]
        .map((match) => ({
        text: cleanHtmlText(match[1]) ?? '',
        dateText: cleanHtmlText(match[2]),
    }))
        .filter((notification) => Boolean(notification.text));
}
function parseGradeNotification(notification, student, term, quarter) {
    const match = /^(.+?) has an updated grade of ([^()]+?) \(([\d.]+)%\) in (.+?): (.+)$/i.exec(notification.text);
    if (!match || !notificationBelongsToStudent(match[1], student)) {
        return undefined;
    }
    const gradeToken = match[2].trim();
    const [scoreText, letterGrade] = gradeToken.split('/').map((part) => part?.trim()).filter(Boolean);
    return {
        courseName: match[4].trim(),
        term,
        quarter: quarter ?? match[5].trim(),
        percent: Number(match[3]),
        score: scoreText ? Number(scoreText) : undefined,
        letterGrade: letterGrade ?? gradeToken,
        source: 'scrape',
        raw: notification,
    };
}
function parseAttendanceNotification(notification, student) {
    const match = /^(.+?) was marked (.+?) in (.+?) on (\d{1,2}\/\d{1,2}\/\d{4})$/i.exec(notification.text);
    if (!match || !notificationBelongsToStudent(match[1], student)) {
        return undefined;
    }
    return {
        date: normalizeDate(match[4]) ?? match[4],
        status: normalizeAttendanceStatus({ status: match[2] }),
        className: match[3].trim(),
        source: 'scrape',
        raw: notification,
    };
}
function parseAssignmentNotification(notification, student) {
    const flaggedMatch = /^(.+?)'s assignment (.+?) in (.+?) has been flagged \(([^)]+)\)$/i.exec(notification.text);
    if (flaggedMatch && notificationBelongsToStudent(flaggedMatch[1], student)) {
        const flag = flaggedMatch[4].trim().toLowerCase();
        return {
            courseName: flaggedMatch[3].trim(),
            title: flaggedMatch[2].trim(),
            isMissing: flag.includes('missing'),
            isLate: flag.includes('late'),
            source: 'scrape',
            raw: notification,
        };
    }
    const scoredMatch = /^(.+?) received a score of ([\d.]+)(?: out of ([\d.]+))? on (.+?) in (.+?)(?: and the assignment has been flagged \(([^)]+)\))?$/i.exec(notification.text);
    if (!scoredMatch || !notificationBelongsToStudent(scoredMatch[1], student)) {
        return undefined;
    }
    const flag = scoredMatch[6]?.trim().toLowerCase() ?? '';
    return {
        courseName: scoredMatch[5].trim(),
        title: scoredMatch[4].trim(),
        score: Number(scoredMatch[2]),
        pointsPossible: scoredMatch[3] ? Number(scoredMatch[3]) : undefined,
        isMissing: flag.includes('missing'),
        isLate: flag.includes('late'),
        source: 'scrape',
        raw: notification,
    };
}
function notificationBelongsToStudent(nameText, student) {
    const candidates = [student.firstName, student.displayName, student.displayName.split(' ')[0]]
        .filter(Boolean)
        .map((value) => normalizeName(value));
    const normalizedName = normalizeName(nameText.replace(/'s$/i, ''));
    return candidates.includes(normalizedName);
}
function cleanHtmlText(value) {
    if (!value) {
        return undefined;
    }
    const withoutTags = value.replace(/<[^>]+>/g, ' ');
    const decoded = decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
    return decoded || undefined;
}
function decodeHtmlEntities(value) {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}
