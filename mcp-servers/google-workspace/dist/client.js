"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleWorkspaceClient = void 0;
const { google } = require('googleapis');
const auth_1 = require("./auth");
const types_1 = require("./types");
const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
const GOOGLE_SHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_CONTENT_BYTES = 50_000;
class GoogleWorkspaceClient {
    auth;
    classroom;
    drive;
    sheets;
    calendar;
    constructor(auth) {
        this.auth = auth;
        this.classroom = google.classroom({ version: 'v1', auth });
        this.drive = google.drive({ version: 'v3', auth });
        this.sheets = google.sheets({ version: 'v4', auth });
        this.calendar = google.calendar({ version: 'v3', auth });
    }
    static async create() {
        const auth = await (0, auth_1.createAuthorizedClient)();
        return new GoogleWorkspaceClient(auth);
    }
    async healthCheck() {
        const about = await this.drive.about.get({
            fields: 'user(displayName,emailAddress)',
        });
        const displayName = about.data.user?.displayName || undefined;
        const emailAddress = about.data.user?.emailAddress || undefined;
        const authenticatedAs = displayName && emailAddress
            ? `${displayName} <${emailAddress}>`
            : emailAddress || displayName;
        return {
            status: 'connected',
            checkedAt: new Date().toISOString(),
            scopes: types_1.GOOGLE_WORKSPACE_SCOPES,
            authenticatedAs: authenticatedAs || emailAddress || displayName,
            message: 'Google Workspace is connected and ready.',
        };
    }
    async getCourses(pageSize = DEFAULT_PAGE_SIZE) {
        const response = await this.classroom.courses.list({
            courseStates: ['ACTIVE'],
            pageSize,
        });
        return (response.data.courses ?? []).map((course) => mapCourse(course));
    }
    async getAssignments(query = {}) {
        const courses = await this.resolveCourses(query.courseId);
        const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
        const now = new Date();
        const allAssignments = (await Promise.all(courses.map(async (course) => {
            const response = await this.classroom.courses.courseWork.list({
                courseId: course.id,
                pageSize,
                orderBy: 'updateTime desc',
            });
            return (response.data.courseWork ?? []).map((work) => mapAssignment(work, course.name));
        }))).flat();
        return allAssignments
            .filter(assignment => !query.upcomingOnly || (assignment.dueAt ? new Date(assignment.dueAt) >= now : false))
            .sort((left, right) => compareIsoDesc(left.dueAt ?? left.updateTime, right.dueAt ?? right.updateTime));
    }
    async getAnnouncements(query = {}) {
        const courses = await this.resolveCourses(query.courseId);
        const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
        const allAnnouncements = (await Promise.all(courses.map(async (course) => {
            const response = await this.classroom.courses.announcements.list({
                courseId: course.id,
                pageSize,
                orderBy: 'updateTime desc',
            });
            return (response.data.announcements ?? []).map((announcement) => mapAnnouncement(announcement, course.name));
        }))).flat();
        return allAnnouncements.sort((left, right) => compareIsoDesc(left.updateTime, right.updateTime));
    }
    async listDriveFiles(query = {}) {
        const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
        const mode = query.mode ?? 'recent';
        const q = buildDriveQuery(mode, query.query);
        const response = await this.drive.files.list({
            pageSize,
            q,
            orderBy: 'modifiedTime desc',
            fields: 'files(id,name,mimeType,modifiedTime,createdTime,webViewLink,description,owners(displayName,emailAddress),shared,size,driveId,lastModifyingUser(displayName,emailAddress))',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        return (response.data.files ?? []).map((file) => mapDriveFile(file));
    }
    async getDriveFile(query) {
        const metadataResponse = await this.drive.files.get({
            fileId: query.fileId,
            fields: 'id,name,mimeType,modifiedTime,createdTime,webViewLink,description,owners(displayName,emailAddress),shared,size,driveId,lastModifyingUser(displayName,emailAddress)',
            supportsAllDrives: true,
        });
        const metadata = mapDriveFile(metadataResponse.data);
        const detail = { ...metadata };
        if (query.includeContent === false) {
            return detail;
        }
        const mimeType = metadata.mimeType;
        const maxContentBytes = query.maxContentBytes ?? DEFAULT_MAX_CONTENT_BYTES;
        if (mimeType === GOOGLE_DOC_MIME_TYPE) {
            const contentText = await this.exportGoogleFile(query.fileId, 'text/plain');
            detail.contentMimeType = 'text/plain';
            detail.contentText = truncateText(contentText, maxContentBytes);
            return detail;
        }
        if (mimeType === GOOGLE_SHEET_MIME_TYPE) {
            detail.spreadsheetPreview = await this.readSheet({
                spreadsheetId: query.fileId,
                sheetName: query.sheetName,
            });
            return detail;
        }
        if (isTextLikeMimeType(mimeType)) {
            const contentText = await this.downloadTextFile(query.fileId);
            detail.contentMimeType = mimeType;
            detail.contentText = truncateText(contentText, maxContentBytes);
        }
        return detail;
    }
    async readSheet(query) {
        const spreadsheet = await this.sheets.spreadsheets.get({
            spreadsheetId: query.spreadsheetId,
            fields: 'properties(title),sheets(properties(title))',
        });
        const spreadsheetTitle = spreadsheet.data.properties?.title || undefined;
        const fallbackSheetName = spreadsheet.data.sheets?.[0]?.properties?.title || undefined;
        const sheetName = query.sheetName || fallbackSheetName;
        if (!sheetName && !query.range) {
            throw new Error('This Google Sheet does not have any tabs to read yet.');
        }
        const range = query.range || quoteSheetName(sheetName);
        const valuesResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: query.spreadsheetId,
            range,
            majorDimension: 'ROWS',
            valueRenderOption: 'FORMATTED_VALUE',
            dateTimeRenderOption: 'FORMATTED_STRING',
        });
        const values = (valuesResponse.data.values ?? []).map((row) => (Array.isArray(row) ? row : []).map((cell) => normalizeSheetCell(cell)));
        return {
            spreadsheetId: query.spreadsheetId,
            spreadsheetTitle,
            sheetName,
            range: valuesResponse.data.range || range,
            majorDimension: valuesResponse.data.majorDimension || undefined,
            values,
            rowCount: values.length,
            columnCount: values.reduce((max, row) => Math.max(max, row.length), 0),
        };
    }
    async getCalendarEvents(query = {}) {
        const response = await this.calendar.events.list({
            calendarId: query.calendarId || 'primary',
            timeMin: query.timeMin || new Date().toISOString(),
            timeMax: query.timeMax,
            maxResults: query.maxResults ?? DEFAULT_PAGE_SIZE,
            singleEvents: true,
            orderBy: 'startTime',
        });
        return (response.data.items ?? []).map((event) => mapCalendarEvent(event));
    }
    async resolveCourses(courseId) {
        if (courseId) {
            const response = await this.classroom.courses.get({ id: courseId });
            const course = mapCourse(response.data);
            return [{ id: course.id, name: course.name }];
        }
        const courses = await this.getCourses(100);
        return courses.map(course => ({ id: course.id, name: course.name }));
    }
    async exportGoogleFile(fileId, mimeType) {
        const response = await this.drive.files.export({
            fileId,
            mimeType,
        }, {
            responseType: 'arraybuffer',
        });
        return bufferToUtf8(response.data);
    }
    async downloadTextFile(fileId) {
        const response = await this.drive.files.get({
            fileId,
            alt: 'media',
            supportsAllDrives: true,
        }, {
            responseType: 'arraybuffer',
        });
        return bufferToUtf8(response.data);
    }
}
exports.GoogleWorkspaceClient = GoogleWorkspaceClient;
function mapCourse(course) {
    return {
        id: requiredString(course.id, 'course id'),
        name: course.name || 'Untitled course',
        section: course.section || undefined,
        descriptionHeading: course.descriptionHeading || undefined,
        room: course.room || undefined,
        state: course.courseState || undefined,
        alternateLink: course.alternateLink || undefined,
        teacherFolderId: course.teacherFolder?.id || undefined,
        updateTime: course.updateTime || undefined,
        ownerId: course.ownerId || undefined,
    };
}
function mapAssignment(courseWork, courseName) {
    return {
        id: requiredString(courseWork.id, 'course work id'),
        courseId: requiredString(courseWork.courseId, 'course id'),
        courseName,
        title: courseWork.title || 'Untitled assignment',
        description: courseWork.description || undefined,
        alternateLink: courseWork.alternateLink || undefined,
        creationTime: courseWork.creationTime || undefined,
        updateTime: courseWork.updateTime || undefined,
        dueAt: buildDueAt(courseWork.dueDate, courseWork.dueTime),
        maxPoints: courseWork.maxPoints ?? undefined,
        state: courseWork.state || undefined,
        workType: courseWork.workType || undefined,
    };
}
function mapAnnouncement(announcement, courseName) {
    return {
        id: requiredString(announcement.id, 'announcement id'),
        courseId: requiredString(announcement.courseId, 'course id'),
        courseName,
        text: announcement.text || undefined,
        alternateLink: announcement.alternateLink || undefined,
        creationTime: announcement.creationTime || undefined,
        updateTime: announcement.updateTime || undefined,
        state: announcement.state || undefined,
    };
}
function mapDriveFile(file) {
    return {
        id: requiredString(file.id, 'file id'),
        name: file.name || 'Untitled file',
        mimeType: file.mimeType || 'application/octet-stream',
        modifiedTime: file.modifiedTime || undefined,
        createdTime: file.createdTime || undefined,
        webViewLink: file.webViewLink || undefined,
        description: file.description || undefined,
        owners: (file.owners ?? []).map(owner => owner.displayName || owner.emailAddress || 'Unknown owner'),
        shared: Boolean(file.shared),
        sizeBytes: file.size ? Number(file.size) : undefined,
        driveId: file.driveId || undefined,
        lastModifyingUser: file.lastModifyingUser?.displayName || file.lastModifyingUser?.emailAddress || undefined,
    };
}
function mapCalendarEvent(event) {
    return {
        id: requiredString(event.id, 'event id'),
        summary: event.summary || 'Untitled event',
        description: event.description || undefined,
        location: event.location || undefined,
        start: event.start?.dateTime || event.start?.date || undefined,
        end: event.end?.dateTime || event.end?.date || undefined,
        htmlLink: event.htmlLink || undefined,
        status: event.status || undefined,
        organizer: event.organizer?.displayName || event.organizer?.email || undefined,
    };
}
function buildDriveQuery(mode, query) {
    const clauses = [];
    if (mode === 'shared') {
        clauses.push('sharedWithMe = true');
    }
    if (query) {
        const escaped = query.replace(/'/g, "\\'");
        clauses.push(`name contains '${escaped}'`);
    }
    return clauses.length > 0 ? clauses.join(' and ') : undefined;
}
function buildDueAt(dueDate, dueTime) {
    if (!dueDate?.year || !dueDate.month || !dueDate.day) {
        return undefined;
    }
    const date = new Date(Date.UTC(dueDate.year, dueDate.month - 1, dueDate.day, dueTime?.hours ?? 0, dueTime?.minutes ?? 0, dueTime?.seconds ?? 0));
    return date.toISOString();
}
function compareIsoDesc(left, right) {
    const leftValue = left ? new Date(left).getTime() : 0;
    const rightValue = right ? new Date(right).getTime() : 0;
    return rightValue - leftValue;
}
function isTextLikeMimeType(mimeType) {
    return mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml' || mimeType === 'text/csv';
}
function truncateText(text, maxBytes) {
    const buffer = Buffer.from(text, 'utf8');
    if (buffer.byteLength <= maxBytes) {
        return text;
    }
    return `${buffer.subarray(0, maxBytes).toString('utf8')}\n\n[Content truncated to ${maxBytes} bytes.]`;
}
function normalizeSheetCell(value) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return value == null ? null : String(value);
}
function quoteSheetName(name) {
    return `'${name.replace(/'/g, "''")}'`;
}
function requiredString(value, label) {
    if (!value) {
        throw new Error(`Google did not return a ${label}.`);
    }
    return value;
}
function bufferToUtf8(data) {
    if (typeof data === 'string') {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data).toString('utf8');
    }
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    }
    return Buffer.from(String(data ?? ''), 'utf8').toString('utf8');
}
