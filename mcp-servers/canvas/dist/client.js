"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasClient = exports.CanvasApiError = exports.CanvasConfigurationError = void 0;
const promises_1 = require("node:timers/promises");
const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 3;
const LOW_RATE_LIMIT_THRESHOLD = 5;
class CanvasConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = "CanvasConfigurationError";
    }
}
exports.CanvasConfigurationError = CanvasConfigurationError;
class CanvasApiError extends Error {
    status;
    details;
    constructor(message, status, details) {
        super(message);
        this.name = "CanvasApiError";
        this.status = status;
        this.details = details;
    }
}
exports.CanvasApiError = CanvasApiError;
class CanvasClient {
    baseUrl;
    apiRoot;
    apiToken;
    defaultObservedUserId;
    fetchImpl;
    userAgent;
    constructor(options) {
        if (!options.baseUrl || !options.apiToken) {
            throw new CanvasConfigurationError("Canvas setup is incomplete. Please set CANVAS_BASE_URL and CANVAS_API_TOKEN before using this server.");
        }
        try {
            this.baseUrl = new URL(options.baseUrl);
        }
        catch {
            throw new CanvasConfigurationError("CANVAS_BASE_URL must be a full HTTPS URL such as https://edmondschools.instructure.com.");
        }
        this.apiRoot = new URL("/api/v1/", this.baseUrl);
        this.apiToken = options.apiToken;
        this.defaultObservedUserId = options.defaultObservedUserId;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.userAgent = options.userAgent ?? "eps-parent-manager-canvas-mcp/0.1.0";
    }
    static fromEnv(env = process.env) {
        return new CanvasClient({
            baseUrl: env.CANVAS_BASE_URL ?? "",
            apiToken: env.CANVAS_API_TOKEN ?? "",
            defaultObservedUserId: env.CANVAS_OBSERVED_USER_ID,
        });
    }
    async healthCheck() {
        const currentUser = await this.getCurrentUser();
        const observedUsers = await this.getObservees();
        return {
            ok: true,
            baseUrl: this.baseUrl.toString(),
            currentUser: {
                id: currentUser.id,
                name: currentUser.name,
                short_name: currentUser.short_name,
            },
            observedUsers: observedUsers.map((user) => ({
                id: user.id,
                name: user.name,
                short_name: user.short_name,
            })),
            defaultObservedUserId: this.defaultObservedUserId ?? null,
            message: observedUsers.length > 0
                ? `Connected to Canvas and found ${observedUsers.length} observed student account(s).`
                : "Connected to Canvas. No observed students were detected, so the server will use the token owner account.",
        };
    }
    async getCurrentUser() {
        const { data } = await this.requestJson("users/self");
        return data;
    }
    async getObservees() {
        return this.paginate("users/self/observees", {
            "include[]": "avatar_url",
            per_page: DEFAULT_PAGE_SIZE,
        });
    }
    async resolveObservedUserId(observedUserId) {
        if (observedUserId) {
            return observedUserId;
        }
        if (this.defaultObservedUserId) {
            return this.defaultObservedUserId;
        }
        const observees = await this.getObservees();
        if (observees.length === 1) {
            return observees[0].id;
        }
        if (observees.length > 1) {
            throw new CanvasConfigurationError("This Canvas parent account is linked to multiple students. Please pass observedUserId to the tool, or set CANVAS_OBSERVED_USER_ID for a default student.");
        }
        return "self";
    }
    async getCourses(observedUserId) {
        const userId = await this.resolveObservedUserId(observedUserId);
        const courses = await this.paginate(`users/${encodeURIComponent(userId)}/courses`, {
            "include[]": ["teachers", "term"],
            "state[]": ["available", "completed"],
            per_page: DEFAULT_PAGE_SIZE,
        });
        return courses.map((course) => ({
            id: course.id,
            name: course.name,
            courseCode: course.course_code,
            workflowState: course.workflow_state,
            termName: course.term?.name,
            startAt: course.start_at,
            endAt: course.end_at,
            teacherNames: course.teachers?.map((teacher) => teacher.display_name) ?? [],
        }));
    }
    async getAssignments(courseId, options = {}) {
        const userId = await this.resolveObservedUserId(options.observedUserId);
        const assignments = await this.paginate(`users/${encodeURIComponent(userId)}/courses/${encodeURIComponent(courseId)}/assignments`, {
            "include[]": ["submission", "score_statistics"],
            bucket: options.bucket,
            per_page: DEFAULT_PAGE_SIZE,
        });
        return assignments.map((assignment) => this.toAssignmentSummary(assignment, courseId));
    }
    async getAllAssignments(observedUserId) {
        const userId = await this.resolveObservedUserId(observedUserId);
        const courses = (await this.getCourses(userId)).filter((course) => course.workflowState === "available");
        const assignmentsByCourse = await Promise.all(courses.map(async (course) => {
            const assignments = await this.getAssignments(course.id, { observedUserId: userId });
            return assignments.map((assignment) => ({
                ...assignment,
                courseName: course.name,
            }));
        }));
        return assignmentsByCourse.flat();
    }
    async getMissingSubmissions(observedUserId) {
        const userId = await this.resolveObservedUserId(observedUserId);
        const submissions = await this.paginate(`users/${encodeURIComponent(userId)}/missing_submissions`, {
            "include[]": ["planner_overrides", "course"],
            "filter[]": "submittable",
            per_page: DEFAULT_PAGE_SIZE,
        });
        return submissions.map((submission) => ({
            id: submission.id,
            name: submission.name,
            course_id: submission.course_id ?? submission.course?.id ?? "",
            course_name: submission.course?.name ?? "",
            due_at: submission.due_at,
            points_possible: submission.points_possible,
            html_url: submission.html_url,
            planner_override: submission.planner_override,
        }));
    }
    async getUpcoming(options = {}) {
        const days = clampDays(options.days);
        const userId = await this.resolveObservedUserId(options.observedUserId);
        const courses = await this.getCourses(userId);
        const endTime = Date.now() + days * 24 * 60 * 60 * 1000;
        const assignmentItems = [];
        for (const course of courses) {
            const assignments = await this.getAssignments(course.id, {
                observedUserId: userId,
                bucket: "upcoming",
            });
            assignmentItems.push(...assignments
                .filter((assignment) => {
                if (!assignment.dueAt) {
                    return false;
                }
                const dueTime = Date.parse(assignment.dueAt);
                return Number.isFinite(dueTime) && dueTime <= endTime;
            })
                .map((assignment) => ({
                kind: "assignment",
                id: assignment.id,
                title: assignment.name,
                date: assignment.dueAt,
                courseId: assignment.courseId,
                courseName: course.name,
                htmlUrl: assignment.htmlUrl,
                details: assignment.description,
                status: assignment.submissionStatus,
            })));
        }
        const calendarItems = (await this.getCalendar({ observedUserId: userId, days })).map((event) => ({
            kind: "event",
            id: event.id,
            title: event.title,
            date: event.start_at ?? event.assignment?.due_at ?? null,
            courseId: event.assignment?.course_id ?? contextCodeToCourseId(event.context_code),
            htmlUrl: event.html_url,
            details: event.description,
        }));
        return [...assignmentItems, ...calendarItems]
            .sort((left, right) => {
            const leftDate = Date.parse(left.date ?? "") || Number.MAX_SAFE_INTEGER;
            const rightDate = Date.parse(right.date ?? "") || Number.MAX_SAFE_INTEGER;
            return leftDate - rightDate;
        })
            .slice(0, 100);
    }
    async getGrades(observedUserId) {
        const userId = await this.resolveObservedUserId(observedUserId);
        const courses = await this.getCourses(userId);
        const grades = [];
        for (const course of courses) {
            const enrollment = await this.getEnrollment(course.id, userId);
            grades.push({
                courseId: course.id,
                courseName: course.name,
                enrollmentState: enrollment?.enrollment_state,
                currentScore: enrollment?.grades?.current_score ?? enrollment?.computed_current_score,
                currentGrade: enrollment?.grades?.current_grade ?? enrollment?.computed_current_grade,
                finalScore: enrollment?.grades?.final_score ?? enrollment?.computed_final_score,
                finalGrade: enrollment?.grades?.final_grade ?? enrollment?.computed_final_grade,
                currentPeriodScore: enrollment?.current_period_computed_current_score,
                currentPeriodGrade: enrollment?.current_period_computed_current_grade,
            });
        }
        return grades;
    }
    async getSubmissions(courseId, assignmentId, observedUserId) {
        const userId = await this.resolveObservedUserId(observedUserId);
        const { data } = await this.requestJson(`courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(userId)}`, {
            "include[]": ["submission_comments", "submission_history", "rubric_assessment"],
        });
        return data;
    }
    async getSyllabus(courseId, observedUserId) {
        await this.resolveObservedUserId(observedUserId);
        const { data } = await this.requestJson(`courses/${encodeURIComponent(courseId)}`, {
            "include[]": "syllabus_body",
        });
        return {
            courseId: data.id,
            courseName: data.name,
            syllabusBody: data.syllabus_body,
        };
    }
    async getModules(courseId, observedUserId) {
        const userId = await this.resolveObservedUserId(observedUserId);
        const modules = await this.paginate(`courses/${encodeURIComponent(courseId)}/modules`, {
            "include[]": "items",
            student_id: userId,
            per_page: DEFAULT_PAGE_SIZE,
        });
        return modules.map((module) => ({
            id: module.id,
            name: module.name,
            position: module.position,
            state: module.state,
            items_count: module.items_count ?? module.items.length,
            items: module.items.map((item) => ({
                id: item.id,
                title: item.title,
                type: item.type,
                position: item.position,
                html_url: item.html_url,
                completion_requirement: item.completion_requirement,
                completed: item.completed,
            })),
        }));
    }
    async getCalendar(options = {}) {
        const userId = await this.resolveObservedUserId(options.observedUserId);
        const courses = await this.getCourses(userId);
        const now = new Date();
        const startDate = now.toISOString();
        const endDate = new Date(now.getTime() + clampDays(options.days) * 24 * 60 * 60 * 1000).toISOString();
        const contextCodes = [`user_${userId}`, ...courses.map((course) => `course_${course.id}`)];
        return this.paginate("calendar_events", {
            "context_codes[]": contextCodes,
            start_date: startDate,
            end_date: endDate,
            all_events: options.includeAllEvents ?? false,
            per_page: DEFAULT_PAGE_SIZE,
        });
    }
    async getAnnouncements(options = {}) {
        const userId = await this.resolveObservedUserId(options.observedUserId);
        const contextCodes = options.courseId
            ? [`course_${options.courseId}`]
            : (await this.getCourses(userId)).map((course) => `course_${course.id}`);
        if (contextCodes.length === 0) {
            return [];
        }
        return this.paginate("announcements", {
            "context_codes[]": contextCodes,
            active_only: options.activeOnly ?? true,
            latest_only: options.latestOnly ?? false,
            per_page: DEFAULT_PAGE_SIZE,
        });
    }
    async getEnrollment(courseId, userId) {
        const enrollments = await this.paginate(`courses/${encodeURIComponent(courseId)}/enrollments`, {
            user_id: userId,
            "include[]": ["current_grading_period_scores"],
            "state[]": ["active", "completed"],
            per_page: DEFAULT_PAGE_SIZE,
        });
        return enrollments[0];
    }
    toAssignmentSummary(assignment, courseId) {
        const submission = assignment.submission ?? undefined;
        return {
            id: assignment.id,
            courseId: assignment.course_id ?? courseId,
            name: assignment.name,
            description: assignment.description,
            dueAt: assignment.due_at,
            unlockAt: assignment.unlock_at,
            lockAt: assignment.lock_at,
            htmlUrl: assignment.html_url,
            pointsPossible: assignment.points_possible,
            published: assignment.published,
            submissionTypes: assignment.submission_types ?? [],
            submissionStatus: deriveSubmissionStatus(submission),
            workflowState: submission?.workflow_state,
            submittedAt: submission?.submitted_at,
            gradedAt: submission?.graded_at,
            score: submission?.score,
            grade: submission?.grade,
            late: submission?.late,
            missing: submission?.missing,
            excused: submission?.excused,
        };
    }
    async paginate(pathOrUrl, query) {
        const items = [];
        let nextUrl = pathOrUrl;
        let nextQuery = query;
        while (nextUrl) {
            const pageResult = await this.requestJson(nextUrl, nextQuery);
            items.push(...pageResult.data);
            nextUrl = parseLinkHeader(pageResult.response.headers.get("link")).next;
            nextQuery = undefined;
        }
        return items;
    }
    async requestJson(pathOrUrl, query) {
        const url = this.buildUrl(pathOrUrl, query);
        let lastError;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
            const response = await this.fetchImpl(url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    Accept: "application/json+canvas-string-ids",
                    "User-Agent": this.userAgent,
                },
            });
            if (response.status === 429) {
                const retryDelay = this.getRetryDelayMs(response, attempt);
                lastError = new CanvasApiError("Canvas asked us to slow down for a moment. Please retry in a few seconds.", response.status);
                if (attempt < MAX_RETRIES - 1) {
                    await (0, promises_1.setTimeout)(retryDelay);
                    continue;
                }
            }
            if (!response.ok) {
                throw await this.toApiError(response);
            }
            await this.paceFromRateLimitHeaders(response);
            const data = (await response.json());
            return { data, response };
        }
        throw lastError ?? new CanvasApiError("Canvas did not return a valid response.", 500);
    }
    buildUrl(pathOrUrl, query) {
        const url = pathOrUrl instanceof URL
            ? new URL(pathOrUrl.toString())
            : /^https?:\/\//i.test(pathOrUrl)
                ? new URL(pathOrUrl)
                : new URL(pathOrUrl.replace(/^\/+/, ""), this.apiRoot);
        if (!query) {
            return url;
        }
        for (const [key, rawValue] of Object.entries(query)) {
            if (rawValue === null || rawValue === undefined) {
                continue;
            }
            if (Array.isArray(rawValue)) {
                for (const value of rawValue) {
                    url.searchParams.append(key, String(value));
                }
            }
            else {
                url.searchParams.set(key, String(rawValue));
            }
        }
        return url;
    }
    async toApiError(response) {
        let details;
        let message = "Canvas returned an unexpected error.";
        try {
            details = await response.json();
        }
        catch {
            details = await response.text();
        }
        if (response.status === 401 || response.status === 403) {
            message =
                "Canvas could not verify this API token. Please confirm the token is active and belongs to the correct Canvas account.";
        }
        else if (response.status === 404) {
            message =
                "Canvas could not find that course, assignment, or student. Double-check the IDs and make sure this account can view them.";
        }
        else if (response.status >= 500) {
            message = "Canvas is having trouble right now. Please try again in a moment.";
        }
        else if (typeof details === "object" && details !== null && "message" in details) {
            message = String(details.message);
        }
        return new CanvasApiError(message, response.status, details);
    }
    getRetryDelayMs(response, attempt) {
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter) {
            const seconds = Number(retryAfter);
            if (Number.isFinite(seconds)) {
                return Math.max(seconds * 1000, 1000);
            }
        }
        const resetHeader = response.headers.get("x-rate-limit-reset");
        if (resetHeader) {
            const numericReset = Number(resetHeader);
            if (Number.isFinite(numericReset)) {
                const asEpochMs = numericReset > 1_000_000 ? numericReset * 1000 : Date.now() + numericReset * 1000;
                return Math.max(asEpochMs - Date.now(), 1000);
            }
        }
        return (attempt + 1) * 1000;
    }
    async paceFromRateLimitHeaders(response) {
        const remainingHeader = response.headers.get("x-rate-limit-remaining");
        if (!remainingHeader) {
            return;
        }
        const remaining = Number(remainingHeader);
        if (!Number.isFinite(remaining)) {
            return;
        }
        if (remaining <= 0) {
            await (0, promises_1.setTimeout)(this.getRetryDelayMs(response, 0));
            return;
        }
        if (remaining < LOW_RATE_LIMIT_THRESHOLD) {
            await (0, promises_1.setTimeout)(250);
        }
    }
}
exports.CanvasClient = CanvasClient;
function deriveSubmissionStatus(submission) {
    if (!submission) {
        return "pending";
    }
    if (submission.excused) {
        return "excused";
    }
    if (submission.missing) {
        return "missing";
    }
    if (submission.late) {
        return submission.score !== null && submission.score !== undefined ? "graded" : "late";
    }
    if (submission.grade !== null && submission.grade !== undefined) {
        return "graded";
    }
    if (submission.submitted_at) {
        return "submitted";
    }
    return "pending";
}
function parseLinkHeader(linkHeader) {
    if (!linkHeader) {
        return {};
    }
    const links = linkHeader.split(",").map((part) => part.trim());
    for (const link of links) {
        const match = link.match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
        if (match && match[2] === "next") {
            return { next: new URL(match[1]) };
        }
    }
    return {};
}
function contextCodeToCourseId(contextCode) {
    if (!contextCode || !contextCode.startsWith("course_")) {
        return null;
    }
    return contextCode.slice("course_".length);
}
function clampDays(days) {
    if (!days || Number.isNaN(days)) {
        return 7;
    }
    return Math.min(Math.max(Math.trunc(days), 1), 14);
}
