import type { CanvasAnnouncement, CanvasAssignmentSummary, CanvasCalendarEvent, CanvasCourseSummary, CanvasGradeSummary, CanvasHealthCheck, CanvasMissingSubmission, CanvasModule, CanvasSubmission, CanvasSyllabus, CanvasUpcomingItem, CanvasUser } from "./types.js";
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
export declare class CanvasConfigurationError extends Error {
    constructor(message: string);
}
export declare class CanvasApiError extends Error {
    readonly status: number;
    readonly details?: unknown;
    constructor(message: string, status: number, details?: unknown);
}
export declare class CanvasClient {
    private readonly baseUrl;
    private readonly apiRoot;
    private readonly apiToken;
    private readonly defaultObservedUserId?;
    private readonly fetchImpl;
    private readonly userAgent;
    constructor(options: CanvasClientOptions);
    static fromEnv(env?: NodeJS.ProcessEnv): CanvasClient;
    healthCheck(): Promise<CanvasHealthCheck>;
    getCurrentUser(): Promise<CanvasUser>;
    getObservees(): Promise<CanvasUser[]>;
    resolveObservedUserId(observedUserId?: string): Promise<string>;
    getCourses(observedUserId?: string): Promise<CanvasCourseSummary[]>;
    getAssignments(courseId: string, options?: GetAssignmentsOptions): Promise<CanvasAssignmentSummary[]>;
    getAllAssignments(observedUserId?: string): Promise<CanvasAssignmentSummary[]>;
    getMissingSubmissions(observedUserId?: string): Promise<CanvasMissingSubmission[]>;
    getUpcoming(options?: GetUpcomingOptions): Promise<CanvasUpcomingItem[]>;
    getGrades(observedUserId?: string): Promise<CanvasGradeSummary[]>;
    getSubmissions(courseId: string, assignmentId: string, observedUserId?: string): Promise<CanvasSubmission>;
    getSyllabus(courseId: string, observedUserId?: string): Promise<CanvasSyllabus>;
    getModules(courseId: string, observedUserId?: string): Promise<CanvasModule[]>;
    getCalendar(options?: GetCalendarOptions): Promise<CanvasCalendarEvent[]>;
    getAnnouncements(options?: GetAnnouncementsOptions): Promise<CanvasAnnouncement[]>;
    private getEnrollment;
    private toAssignmentSummary;
    private paginate;
    private requestJson;
    private buildUrl;
    private toApiError;
    private getRetryDelayMs;
    private paceFromRateLimitHeaders;
}
