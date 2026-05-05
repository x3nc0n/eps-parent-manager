import { setTimeout as delay } from "node:timers/promises";

import type {
  CanvasAnnouncement,
  CanvasAssignment,
  CanvasAssignmentSummary,
  CanvasCalendarEvent,
  CanvasCourse,
  CanvasCourseSummary,
  CanvasEnrollment,
  CanvasGradeSummary,
  CanvasHealthCheck,
  CanvasId,
  CanvasMissingSubmission,
  CanvasMissingSubmissionResponse,
  CanvasModule,
  CanvasModuleItem,
  CanvasSubmission,
  CanvasSubmissionStatus,
  CanvasSyllabus,
  CanvasUpcomingItem,
  CanvasUser,
} from "./types.js";

const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 3;
const LOW_RATE_LIMIT_THRESHOLD = 5;

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | QueryPrimitive[] | null | undefined;

export interface CanvasClientOptions {
  baseUrl: string;
  apiToken: string;
  defaultObservedUserId?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export interface GetAssignmentsOptions {
  observedUserId?: string;
  bucket?: string;
}

export interface GetUpcomingOptions {
  observedUserId?: string;
  days?: number;
}

export interface GetCalendarOptions {
  observedUserId?: string;
  days?: number;
  includeAllEvents?: boolean;
}

export interface GetAnnouncementsOptions {
  observedUserId?: string;
  courseId?: string;
  latestOnly?: boolean;
  activeOnly?: boolean;
}

export class CanvasConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasConfigurationError";
  }
}

export class CanvasApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "CanvasApiError";
    this.status = status;
    this.details = details;
  }
}

export class CanvasClient {
  private readonly baseUrl: URL;
  private readonly apiRoot: URL;
  private readonly apiToken: string;
  private readonly defaultObservedUserId?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: CanvasClientOptions) {
    if (!options.baseUrl || !options.apiToken) {
      throw new CanvasConfigurationError(
        "Canvas setup is incomplete. Please set CANVAS_BASE_URL and CANVAS_API_TOKEN before using this server.",
      );
    }

    try {
      this.baseUrl = new URL(options.baseUrl);
    } catch {
      throw new CanvasConfigurationError(
        "CANVAS_BASE_URL must be a full HTTPS URL such as https://edmondschools.instructure.com.",
      );
    }

    this.apiRoot = new URL("/api/v1/", this.baseUrl);
    this.apiToken = options.apiToken;
    this.defaultObservedUserId = options.defaultObservedUserId;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? "eps-parent-manager-canvas-mcp/0.1.0";
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): CanvasClient {
    return new CanvasClient({
      baseUrl: env.CANVAS_BASE_URL ?? "",
      apiToken: env.CANVAS_API_TOKEN ?? "",
      defaultObservedUserId: env.CANVAS_OBSERVED_USER_ID,
    });
  }

  async healthCheck(): Promise<CanvasHealthCheck> {
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
      message:
        observedUsers.length > 0
          ? `Connected to Canvas and found ${observedUsers.length} observed student account(s).`
          : "Connected to Canvas. No observed students were detected, so the server will use the token owner account.",
    };
  }

  async getCurrentUser(): Promise<CanvasUser> {
    const { data } = await this.requestJson<CanvasUser>("users/self");
    return data;
  }

  async getObservees(): Promise<CanvasUser[]> {
    return this.paginate<CanvasUser>("users/self/observees", {
      "include[]": "avatar_url",
      per_page: DEFAULT_PAGE_SIZE,
    });
  }

  async resolveObservedUserId(observedUserId?: string): Promise<string> {
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
      throw new CanvasConfigurationError(
        "This Canvas parent account is linked to multiple students. Please pass observedUserId to the tool, or set CANVAS_OBSERVED_USER_ID for a default student.",
      );
    }

    return "self";
  }

  async getCourses(observedUserId?: string): Promise<CanvasCourseSummary[]> {
    const userId = await this.resolveObservedUserId(observedUserId);
    const courses = await this.paginate<CanvasCourse>(`users/${encodeURIComponent(userId)}/courses`, {
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

  async getAssignments(courseId: string, options: GetAssignmentsOptions = {}): Promise<CanvasAssignmentSummary[]> {
    const userId = await this.resolveObservedUserId(options.observedUserId);
    const assignments = await this.paginate<CanvasAssignment>(
      `users/${encodeURIComponent(userId)}/courses/${encodeURIComponent(courseId)}/assignments`,
      {
        "include[]": ["submission", "score_statistics"],
        bucket: options.bucket,
        per_page: DEFAULT_PAGE_SIZE,
      },
    );

    return assignments.map((assignment) => this.toAssignmentSummary(assignment, courseId));
  }

  async getAllAssignments(observedUserId?: string): Promise<CanvasAssignmentSummary[]> {
    const userId = await this.resolveObservedUserId(observedUserId);
    const courses = (await this.getCourses(userId)).filter((course) => course.workflowState === "available");
    const assignmentsByCourse = await Promise.all(
      courses.map(async (course) => {
        const assignments = await this.getAssignments(course.id, { observedUserId: userId });
        return assignments.map((assignment) => ({
          ...assignment,
          courseName: course.name,
        }));
      }),
    );

    return assignmentsByCourse.flat();
  }

  async getMissingSubmissions(observedUserId?: string): Promise<CanvasMissingSubmission[]> {
    const userId = await this.resolveObservedUserId(observedUserId);
    const submissions = await this.paginate<CanvasMissingSubmissionResponse>(
      `users/${encodeURIComponent(userId)}/missing_submissions`,
      {
        "include[]": ["planner_overrides", "course"],
        "filter[]": "submittable",
        per_page: DEFAULT_PAGE_SIZE,
      },
    );

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

  async getUpcoming(options: GetUpcomingOptions = {}): Promise<CanvasUpcomingItem[]> {
    const days = clampDays(options.days);
    const userId = await this.resolveObservedUserId(options.observedUserId);
    const courses = await this.getCourses(userId);
    const endTime = Date.now() + days * 24 * 60 * 60 * 1000;

    const assignmentItems: CanvasUpcomingItem[] = [];
    for (const course of courses) {
      const assignments = await this.getAssignments(course.id, {
        observedUserId: userId,
        bucket: "upcoming",
      });

      assignmentItems.push(
        ...assignments
          .filter((assignment) => {
            if (!assignment.dueAt) {
              return false;
            }

            const dueTime = Date.parse(assignment.dueAt);
            return Number.isFinite(dueTime) && dueTime <= endTime;
          })
          .map((assignment) => ({
            kind: "assignment" as const,
            id: assignment.id,
            title: assignment.name,
            date: assignment.dueAt,
            courseId: assignment.courseId,
            courseName: course.name,
            htmlUrl: assignment.htmlUrl,
            details: assignment.description,
            status: assignment.submissionStatus,
          })),
      );
    }

    const calendarItems = (await this.getCalendar({ observedUserId: userId, days })).map((event) => ({
      kind: "event" as const,
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

  async getGrades(observedUserId?: string): Promise<CanvasGradeSummary[]> {
    const userId = await this.resolveObservedUserId(observedUserId);
    const courses = await this.getCourses(userId);
    const grades: CanvasGradeSummary[] = [];

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

  async getSubmissions(courseId: string, assignmentId: string, observedUserId?: string): Promise<CanvasSubmission> {
    const userId = await this.resolveObservedUserId(observedUserId);
    const { data } = await this.requestJson<CanvasSubmission>(
      `courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(userId)}`,
      {
        "include[]": ["submission_comments", "submission_history", "rubric_assessment"],
      },
    );

    return data;
  }

  async getSyllabus(courseId: string, observedUserId?: string): Promise<CanvasSyllabus> {
    await this.resolveObservedUserId(observedUserId);
    const { data } = await this.requestJson<CanvasCourse>(`courses/${encodeURIComponent(courseId)}`, {
      "include[]": "syllabus_body",
    });

    return {
      courseId: data.id,
      courseName: data.name,
      syllabusBody: data.syllabus_body,
    };
  }

  async getModules(courseId: string, observedUserId?: string): Promise<CanvasModule[]> {
    const userId = await this.resolveObservedUserId(observedUserId);
    const modules = await this.paginate<CanvasModule>(`courses/${encodeURIComponent(courseId)}/modules`, {
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
      items: module.items.map((item): CanvasModuleItem => ({
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

  async getCalendar(options: GetCalendarOptions = {}): Promise<CanvasCalendarEvent[]> {
    const userId = await this.resolveObservedUserId(options.observedUserId);
    const courses = await this.getCourses(userId);
    const now = new Date();
    const startDate = now.toISOString();
    const endDate = new Date(now.getTime() + clampDays(options.days) * 24 * 60 * 60 * 1000).toISOString();
    const contextCodes = [`user_${userId}`, ...courses.map((course) => `course_${course.id}`)];

    return this.paginate<CanvasCalendarEvent>("calendar_events", {
      "context_codes[]": contextCodes,
      start_date: startDate,
      end_date: endDate,
      all_events: options.includeAllEvents ?? false,
      per_page: DEFAULT_PAGE_SIZE,
    });
  }

  async getAnnouncements(options: GetAnnouncementsOptions = {}): Promise<CanvasAnnouncement[]> {
    const userId = await this.resolveObservedUserId(options.observedUserId);
    const contextCodes = options.courseId
      ? [`course_${options.courseId}`]
      : (await this.getCourses(userId)).map((course) => `course_${course.id}`);

    if (contextCodes.length === 0) {
      return [];
    }

    return this.paginate<CanvasAnnouncement>("announcements", {
      "context_codes[]": contextCodes,
      active_only: options.activeOnly ?? true,
      latest_only: options.latestOnly ?? false,
      per_page: DEFAULT_PAGE_SIZE,
    });
  }

  private async getEnrollment(courseId: string, userId: string): Promise<CanvasEnrollment | undefined> {
    const enrollments = await this.paginate<CanvasEnrollment>(`courses/${encodeURIComponent(courseId)}/enrollments`, {
      user_id: userId,
      "include[]": ["current_grading_period_scores"],
      "state[]": ["active", "completed"],
      per_page: DEFAULT_PAGE_SIZE,
    });

    return enrollments[0];
  }

  private toAssignmentSummary(assignment: CanvasAssignment, courseId: string): CanvasAssignmentSummary {
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

  private async paginate<T>(pathOrUrl: string | URL, query?: Record<string, QueryValue>): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | URL | undefined = pathOrUrl;
    let nextQuery: Record<string, QueryValue> | undefined = query;

    while (nextUrl) {
      const pageResult: { data: T[]; response: Response } = await this.requestJson<T[]>(nextUrl, nextQuery);
      items.push(...pageResult.data);
      nextUrl = parseLinkHeader(pageResult.response.headers.get("link")).next;
      nextQuery = undefined;
    }

    return items;
  }

  private async requestJson<T>(pathOrUrl: string | URL, query?: Record<string, QueryValue>): Promise<{ data: T; response: Response }> {
    const url = this.buildUrl(pathOrUrl, query);
    let lastError: CanvasApiError | undefined;

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
        lastError = new CanvasApiError(
          "Canvas asked us to slow down for a moment. Please retry in a few seconds.",
          response.status,
        );

        if (attempt < MAX_RETRIES - 1) {
          await delay(retryDelay);
          continue;
        }
      }

      if (!response.ok) {
        throw await this.toApiError(response);
      }

      await this.paceFromRateLimitHeaders(response);
      const data = (await response.json()) as T;
      return { data, response };
    }

    throw lastError ?? new CanvasApiError("Canvas did not return a valid response.", 500);
  }

  private buildUrl(pathOrUrl: string | URL, query?: Record<string, QueryValue>): URL {
    const url =
      pathOrUrl instanceof URL
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
      } else {
        url.searchParams.set(key, String(rawValue));
      }
    }

    return url;
  }

  private async toApiError(response: Response): Promise<CanvasApiError> {
    let details: unknown;
    let message = "Canvas returned an unexpected error.";

    try {
      details = await response.json();
    } catch {
      details = await response.text();
    }

    if (response.status === 401 || response.status === 403) {
      message =
        "Canvas could not verify this API token. Please confirm the token is active and belongs to the correct Canvas account.";
    } else if (response.status === 404) {
      message =
        "Canvas could not find that course, assignment, or student. Double-check the IDs and make sure this account can view them.";
    } else if (response.status >= 500) {
      message = "Canvas is having trouble right now. Please try again in a moment.";
    } else if (typeof details === "object" && details !== null && "message" in details) {
      message = String((details as { message: unknown }).message);
    }

    return new CanvasApiError(message, response.status, details);
  }

  private getRetryDelayMs(response: Response, attempt: number): number {
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

  private async paceFromRateLimitHeaders(response: Response): Promise<void> {
    const remainingHeader = response.headers.get("x-rate-limit-remaining");
    if (!remainingHeader) {
      return;
    }

    const remaining = Number(remainingHeader);
    if (!Number.isFinite(remaining)) {
      return;
    }

    if (remaining <= 0) {
      await delay(this.getRetryDelayMs(response, 0));
      return;
    }

    if (remaining < LOW_RATE_LIMIT_THRESHOLD) {
      await delay(250);
    }
  }
}

function deriveSubmissionStatus(submission?: CanvasSubmission): CanvasSubmissionStatus {
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

function parseLinkHeader(linkHeader: string | null): { next?: URL } {
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

function contextCodeToCourseId(contextCode?: string | null): CanvasId | null {
  if (!contextCode || !contextCode.startsWith("course_")) {
    return null;
  }

  return contextCode.slice("course_".length);
}

function clampDays(days?: number): number {
  if (!days || Number.isNaN(days)) {
    return 7;
  }

  return Math.min(Math.max(Math.trunc(days), 1), 14);
}
