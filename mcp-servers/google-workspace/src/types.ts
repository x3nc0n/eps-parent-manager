export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

export type GoogleWorkspaceScope = (typeof GOOGLE_WORKSPACE_SCOPES)[number];
export type DriveListMode = 'recent' | 'shared';
export type HealthStatus = 'connected' | 'degraded';
export type SheetCellValue = string | number | boolean | null;

export interface GoogleOAuthEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GoogleWorkspaceHealthCheck {
  status: HealthStatus;
  checkedAt: string;
  scopes: readonly GoogleWorkspaceScope[];
  message: string;
  authenticatedAs?: string;
}

export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  room?: string;
  state?: string;
  alternateLink?: string;
  teacherFolderId?: string;
  updateTime?: string;
  ownerId?: string;
}

export interface ClassroomAssignment {
  id: string;
  courseId: string;
  courseName?: string;
  title: string;
  description?: string;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
  dueAt?: string;
  maxPoints?: number;
  state?: string;
  workType?: string;
}

export interface ClassroomAnnouncement {
  id: string;
  courseId: string;
  courseName?: string;
  text?: string;
  alternateLink?: string;
  creationTime?: string;
  updateTime?: string;
  state?: string;
}

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  description?: string;
  owners: string[];
  shared: boolean;
  sizeBytes?: number;
  driveId?: string;
  lastModifyingUser?: string;
}

export interface SheetReadResult {
  spreadsheetId: string;
  spreadsheetTitle?: string;
  sheetName?: string;
  range: string;
  majorDimension?: string;
  values: SheetCellValue[][];
  rowCount: number;
  columnCount: number;
}

export interface DriveFileDetail extends DriveFileSummary {
  contentMimeType?: string;
  contentText?: string;
  spreadsheetPreview?: SheetReadResult;
}

export interface CalendarEventSummary {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  htmlLink?: string;
  status?: string;
  organizer?: string;
}

export interface ClassroomAssignmentsQuery {
  courseId?: string;
  pageSize?: number;
  upcomingOnly?: boolean;
}

export interface ClassroomAnnouncementsQuery {
  courseId?: string;
  pageSize?: number;
}

export interface DriveListFilesQuery {
  mode?: DriveListMode;
  pageSize?: number;
  query?: string;
}

export interface DriveGetFileQuery {
  fileId: string;
  includeContent?: boolean;
  maxContentBytes?: number;
  sheetName?: string;
}

export interface SheetsReadQuery {
  spreadsheetId: string;
  range?: string;
  sheetName?: string;
}

export interface CalendarEventsQuery {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}
