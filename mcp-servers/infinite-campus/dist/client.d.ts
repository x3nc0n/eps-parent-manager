import { AssignmentsSnapshot, AttendanceSnapshot, GradesSnapshot, HealthCheckResult, InfiniteCampusConfig, ReportCardSnapshot, ScheduleSnapshot, StudentProfile, StudentSelector } from './types';
export declare class InfiniteCampusError extends Error {
    readonly userMessage: string;
    constructor(message: string, userMessage?: string, options?: {
        cause?: unknown;
    });
}
export declare class InfiniteCampusClient {
    private readonly config;
    private readonly cookies;
    private lastAuthenticatedAt?;
    private loginPromise?;
    private readonly streamerMode;
    constructor(config: InfiniteCampusConfig);
    static fromEnv(env?: NodeJS.ProcessEnv): InfiniteCampusClient;
    healthCheck(): Promise<HealthCheckResult>;
    getStudents(): Promise<StudentProfile[]>;
    getStudentProfile(selector?: StudentSelector): Promise<StudentProfile>;
    getGrades(selector?: StudentSelector & {
        term?: string;
        quarter?: string;
    }): Promise<GradesSnapshot>;
    getAttendance(selector?: StudentSelector & {
        startDate?: string;
        endDate?: string;
    }): Promise<AttendanceSnapshot>;
    getSchedule(selector?: StudentSelector): Promise<ScheduleSnapshot>;
    getAssignments(selector?: StudentSelector & {
        term?: string;
    }): Promise<AssignmentsSnapshot>;
    getReportCard(selector?: StudentSelector & {
        term?: string;
    }): Promise<ReportCardSnapshot>;
    getDefaultStudentProfileForResource(): Promise<StudentProfile>;
    getCurrentGradesForResource(): Promise<GradesSnapshot>;
    private resolveStudent;
    private fetchStudentProfilesFromApi;
    private fetchStudentProfilesFromPages;
    private fetchGradesFromApi;
    private fetchGradesFromPages;
    private fetchAttendanceFromApi;
    private fetchAttendanceFromPages;
    private fetchScheduleFromApi;
    private fetchScheduleFromPages;
    private fetchAssignmentsFromApi;
    private fetchAssignmentsFromPages;
    private fetchReportCardFromApi;
    private fetchReportCardFromPages;
    private ensureAuthenticated;
    private performLogin;
    private buildLoginAttempts;
    private isSuccessfulLoginResponse;
    private fetchJson;
    private fetchHtml;
    private request;
    private isExpiredSessionResponse;
    private rawFetch;
    private resolveUrl;
    private buildApiPaths;
    private buildPortalPaths;
    private buildLoginPageCandidates;
    private buildLoginPostCandidates;
    private buildHomePageCandidates;
    private getStudentPersonId;
    private getPrimaryEnrollmentId;
    private findBestObjectArray;
    private normalizeStudent;
    private normalizeGrade;
    private normalizeAttendance;
    private normalizeSchedule;
    private normalizeAssignment;
    private normalizeReportCardCourse;
}
