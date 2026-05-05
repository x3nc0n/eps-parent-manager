/**
 * Streamer Mode — masks PII in all data returned by the Infinite Campus MCP server
 * so the user can safely demo the tool on a livestream or presentation.
 *
 * Enable by setting STREAMER_MODE=true or EPS_STREAMER_MODE=1 in the environment.
 *
 * What is masked:
 *   - Last names            → first letter + asterisks  (e.g. "Spaid" → "S****")
 *   - Student/person IDs    → "***REDACTED***"
 *   - Birth dates           → "XXXX-XX-XX"
 *   - School / campus names → "Demo School"
 *   - Teacher names         → first letter of last name + asterisks
 *   - Course identifiers    → deterministic opaque hex token
 *   - Assignment identifiers→ deterministic opaque hex token
 *   - Numeric grades / GPA  → perturbed but realistic-looking value
 *   - Room numbers          → "Room XX"
 *
 * What is preserved (so demos look realistic):
 *   - First names, course names, letter grades, attendance status types,
 *     assignment titles, date structures (non-birthdate), source metadata
 */
import { AssignmentRecord, AssignmentsSnapshot, AttendanceRecord, AttendanceSnapshot, GradeEntry, GradesSnapshot, ReportCardCourse, ReportCardSnapshot, ScheduleEntry, ScheduleSnapshot, StudentProfile } from './types';
export declare function isStreamerModeEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function maskStudentProfile(profile: StudentProfile): StudentProfile;
export declare function maskGradeEntry(entry: GradeEntry): GradeEntry;
export declare function maskScheduleEntry(entry: ScheduleEntry): ScheduleEntry;
export declare function maskAssignmentRecord(record: AssignmentRecord): AssignmentRecord;
export declare function maskReportCardCourse(course: ReportCardCourse): ReportCardCourse;
export declare function maskGradesSnapshot(snapshot: GradesSnapshot): GradesSnapshot;
export declare function maskAttendanceRecord(record: AttendanceRecord): AttendanceRecord;
export declare function maskAttendanceSnapshot(snapshot: AttendanceSnapshot): AttendanceSnapshot;
export declare function maskScheduleSnapshot(snapshot: ScheduleSnapshot): ScheduleSnapshot;
export declare function maskAssignmentsSnapshot(snapshot: AssignmentsSnapshot): AssignmentsSnapshot;
export declare function maskReportCardSnapshot(snapshot: ReportCardSnapshot): ReportCardSnapshot;
