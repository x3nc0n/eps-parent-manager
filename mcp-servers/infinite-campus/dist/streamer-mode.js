"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStreamerModeEnabled = isStreamerModeEnabled;
exports.maskStudentProfile = maskStudentProfile;
exports.maskGradeEntry = maskGradeEntry;
exports.maskScheduleEntry = maskScheduleEntry;
exports.maskAssignmentRecord = maskAssignmentRecord;
exports.maskReportCardCourse = maskReportCardCourse;
exports.maskGradesSnapshot = maskGradesSnapshot;
exports.maskAttendanceRecord = maskAttendanceRecord;
exports.maskAttendanceSnapshot = maskAttendanceSnapshot;
exports.maskScheduleSnapshot = maskScheduleSnapshot;
exports.maskAssignmentsSnapshot = maskAssignmentsSnapshot;
exports.maskReportCardSnapshot = maskReportCardSnapshot;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** DJB2 hash — deterministic, no dependencies. */
function djb2(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}
/** Seeded float in [0, 1) derived from a DJB2 hash integer. */
function seededFloat(hash) {
    const x = Math.sin(hash + 1) * 10000;
    return x - Math.floor(x);
}
/**
 * Deterministically perturb a numeric value by up to ±maxDelta.
 * The same seed always produces the same result, so the demo looks
 * consistent across multiple tool calls in one session.
 */
function perturbNumeric(value, seed, maxDelta) {
    const rng = seededFloat(djb2(seed));
    const delta = (rng * 2 - 1) * maxDelta;
    return Math.round((value + delta) * 10) / 10;
}
/** Mask a last name token: keep first letter, replace remainder with asterisks. */
function maskLastNameToken(name) {
    if (!name || name.length <= 1)
        return name;
    return name[0] + '*'.repeat(name.length - 1);
}
/**
 * Mask a full "First [Middle] Last" name.
 * Keeps all tokens except the last (last name), which is masked.
 * If only one token is present it is treated as a last name.
 */
function maskFullName(fullName) {
    if (!fullName)
        return undefined;
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
        return maskLastNameToken(parts[0]);
    }
    const givenParts = parts.slice(0, -1).join(' ');
    const maskedLast = maskLastNameToken(parts[parts.length - 1]);
    return `${givenParts} ${maskedLast}`;
}
/** Produce a short, opaque but deterministic identifier for demo display. */
function maskIdentifier(id) {
    if (!id)
        return undefined;
    return `demo-${djb2(id).toString(16).padStart(8, '0')}`;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function isStreamerModeEnabled(env = process.env) {
    const v1 = env.STREAMER_MODE?.trim().toLowerCase();
    const v2 = env.EPS_STREAMER_MODE?.trim().toLowerCase();
    return v1 === 'true' || v1 === '1' || v2 === '1' || v2 === 'true';
}
function maskStudentProfile(profile) {
    if (!isStreamerModeEnabled())
        return profile;
    const maskedLastName = profile.lastName !== undefined ? maskLastNameToken(profile.lastName) : undefined;
    // Rebuild displayName so it stays coherent with the masked lastName.
    let maskedDisplayName = profile.displayName;
    if (maskedLastName !== undefined) {
        maskedDisplayName = profile.firstName
            ? `${profile.firstName} ${maskedLastName}`
            : profile.displayName.replace(/\S+$/, maskedLastName);
    }
    else {
        // No separate lastName field — mask the last word of displayName when there are multiple words.
        const parts = profile.displayName.trim().split(/\s+/);
        if (parts.length > 1) {
            parts[parts.length - 1] = maskLastNameToken(parts[parts.length - 1]);
            maskedDisplayName = parts.join(' ');
        }
        // Single-token displayName is treated as a first name — leave it alone.
    }
    return {
        ...profile,
        displayName: maskedDisplayName,
        lastName: maskedLastName,
        personId: profile.personId ? maskIdentifier(profile.personId) : undefined,
        studentId: profile.studentId ? maskIdentifier(profile.studentId) : undefined,
        studentNumber: profile.studentNumber ? maskIdentifier(profile.studentNumber) : undefined,
        birthDate: profile.birthDate ? 'XXXX-XX-XX' : undefined,
        schoolName: profile.schoolName ? 'Demo School' : undefined,
        campusName: profile.campusName ? 'Demo School' : undefined,
        profilePhotoUrl: undefined,
        raw: undefined,
    };
}
function maskGradeEntry(entry) {
    if (!isStreamerModeEnabled())
        return entry;
    const seed = entry.courseId ?? entry.courseName;
    return {
        ...entry,
        courseId: maskIdentifier(entry.courseId),
        sectionId: maskIdentifier(entry.sectionId),
        teacherName: maskFullName(entry.teacherName),
        percent: entry.percent != null
            ? Math.max(0, Math.min(100, perturbNumeric(entry.percent, seed, 4)))
            : entry.percent,
        score: entry.score != null
            ? Math.max(0, perturbNumeric(entry.score, `${seed}-score`, 4))
            : entry.score,
        raw: undefined,
    };
}
function maskScheduleEntry(entry) {
    if (!isStreamerModeEnabled())
        return entry;
    return {
        ...entry,
        teacherName: maskFullName(entry.teacherName),
        room: entry.room ? 'Room XX' : undefined,
        raw: undefined,
    };
}
function maskAssignmentRecord(record) {
    if (!isStreamerModeEnabled())
        return record;
    const seed = record.assignmentId ?? record.title;
    return {
        ...record,
        assignmentId: maskIdentifier(record.assignmentId),
        courseId: maskIdentifier(record.courseId),
        score: record.score != null
            ? Math.max(0, perturbNumeric(record.score, seed, 2))
            : record.score,
        raw: undefined,
    };
}
function maskReportCardCourse(course) {
    if (!isStreamerModeEnabled())
        return course;
    return {
        ...course,
        teacherName: maskFullName(course.teacherName),
        finalPercent: course.finalPercent != null
            ? Math.max(0, Math.min(100, perturbNumeric(course.finalPercent, course.courseName, 4)))
            : course.finalPercent,
        raw: undefined,
    };
}
function maskGradesSnapshot(snapshot) {
    if (!isStreamerModeEnabled())
        return snapshot;
    return {
        ...snapshot,
        student: maskStudentProfile(snapshot.student),
        grades: snapshot.grades.map(maskGradeEntry),
    };
}
function maskAttendanceRecord(record) {
    if (!isStreamerModeEnabled())
        return record;
    return { ...record, raw: undefined };
}
function maskAttendanceSnapshot(snapshot) {
    if (!isStreamerModeEnabled())
        return snapshot;
    return {
        ...snapshot,
        student: maskStudentProfile(snapshot.student),
        records: snapshot.records.map(maskAttendanceRecord),
    };
}
function maskScheduleSnapshot(snapshot) {
    if (!isStreamerModeEnabled())
        return snapshot;
    return {
        ...snapshot,
        student: maskStudentProfile(snapshot.student),
        entries: snapshot.entries.map(maskScheduleEntry),
    };
}
function maskAssignmentsSnapshot(snapshot) {
    if (!isStreamerModeEnabled())
        return snapshot;
    return {
        ...snapshot,
        student: maskStudentProfile(snapshot.student),
        assignments: snapshot.assignments.map(maskAssignmentRecord),
    };
}
function maskReportCardSnapshot(snapshot) {
    if (!isStreamerModeEnabled())
        return snapshot;
    const gpaSeed = snapshot.student.studentId ?? snapshot.student.displayName;
    return {
        ...snapshot,
        student: maskStudentProfile(snapshot.student),
        courses: snapshot.courses.map(maskReportCardCourse),
        gpa: snapshot.gpa != null
            ? Math.max(0, Math.min(4.0, perturbNumeric(snapshot.gpa, gpaSeed, 0.2)))
            : snapshot.gpa,
    };
}
