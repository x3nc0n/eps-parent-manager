export type CanvasId = string;

export interface CanvasUser {
  id: CanvasId;
  name: string;
  short_name?: string;
  sortable_name?: string;
  avatar_url?: string | null;
  observation_link_root_account_ids?: CanvasId[];
}

export interface CanvasTerm {
  id: CanvasId;
  name: string;
  start_at?: string | null;
  end_at?: string | null;
}

export interface CanvasTeacher {
  id: CanvasId;
  display_name: string;
}

export interface CanvasEnrollmentGrades {
  current_score?: number | null;
  current_grade?: string | null;
  final_score?: number | null;
  final_grade?: string | null;
  current_points?: number | null;
  unposted_current_score?: number | null;
  unposted_final_score?: number | null;
}

export interface CanvasEnrollment {
  id: CanvasId;
  course_id: CanvasId;
  user_id: CanvasId;
  type?: string;
  role?: string;
  enrollment_state?: string;
  course_section_id?: CanvasId | null;
  grades?: CanvasEnrollmentGrades;
  computed_current_score?: number | null;
  computed_current_grade?: string | null;
  computed_final_score?: number | null;
  computed_final_grade?: string | null;
  current_period_computed_current_score?: number | null;
  current_period_computed_current_grade?: string | null;
  current_period_computed_final_score?: number | null;
  current_period_computed_final_grade?: string | null;
  course?: Pick<CanvasCourse, "id" | "name" | "course_code">;
}

export interface CanvasCourse {
  id: CanvasId;
  name: string;
  course_code?: string | null;
  workflow_state?: string;
  start_at?: string | null;
  end_at?: string | null;
  public_description?: string | null;
  default_view?: string | null;
  syllabus_body?: string | null;
  term?: CanvasTerm | null;
  teachers?: CanvasTeacher[];
  enrollments?: CanvasEnrollment[];
}

export interface CanvasSubmissionComment {
  id: CanvasId;
  author_id?: CanvasId | null;
  author_name?: string | null;
  comment: string;
  created_at?: string | null;
}

export interface CanvasSubmission {
  id?: CanvasId | null;
  assignment_id?: CanvasId | null;
  user_id?: CanvasId | null;
  attempt?: number | null;
  body?: string | null;
  grade?: string | null;
  score?: number | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean;
  workflow_state?: string | null;
  submission_type?: string | null;
  preview_url?: string | null;
  url?: string | null;
  read_status?: string | null;
  submission_comments?: CanvasSubmissionComment[];
}

export interface CanvasAssignment {
  id: CanvasId;
  course_id?: CanvasId;
  name: string;
  description?: string | null;
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  html_url?: string | null;
  points_possible?: number | null;
  published?: boolean;
  submission_types?: string[];
  has_submitted_submissions?: boolean;
  needs_grading_count?: number;
  submission?: CanvasSubmission | null;
}

export interface CanvasCalendarEvent {
  id: CanvasId;
  title: string;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  all_day_date?: string | null;
  location_name?: string | null;
  context_code?: string | null;
  html_url?: string | null;
  workflow_state?: string | null;
  type?: string | null;
  assignment?: Pick<CanvasAssignment, "id" | "name" | "due_at" | "course_id"> | null;
}

export interface CanvasAnnouncement {
  id: CanvasId;
  title: string;
  message?: string | null;
  posted_at?: string | null;
  delayed_post_at?: string | null;
  published?: boolean;
  read_state?: string | null;
  html_url?: string | null;
  context_code?: string | null;
}

export type CanvasSubmissionStatus =
  | "pending"
  | "submitted"
  | "graded"
  | "late"
  | "missing"
  | "excused";

export interface CanvasCourseSummary {
  id: CanvasId;
  name: string;
  courseCode?: string | null;
  workflowState?: string;
  termName?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  teacherNames: string[];
}

export interface CanvasAssignmentSummary {
  id: CanvasId;
  courseId: CanvasId;
  courseName?: string | null;
  name: string;
  description?: string | null;
  dueAt?: string | null;
  unlockAt?: string | null;
  lockAt?: string | null;
  htmlUrl?: string | null;
  pointsPossible?: number | null;
  published?: boolean;
  submissionTypes: string[];
  submissionStatus: CanvasSubmissionStatus;
  workflowState?: string | null;
  submittedAt?: string | null;
  gradedAt?: string | null;
  score?: number | null;
  grade?: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean;
}

export interface CanvasPlannerOverride {
  id?: CanvasId;
  plannable_id?: CanvasId | null;
  plannable_type?: string | null;
  marked_complete?: boolean | null;
  dismissed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CanvasMissingSubmissionResponse extends CanvasAssignment {
  course?: Pick<CanvasCourse, "id" | "name"> | null;
  planner_override?: CanvasPlannerOverride | null;
}

export interface CanvasMissingSubmission {
  id: CanvasId;
  name: string;
  course_id: CanvasId;
  course_name: string;
  due_at?: string | null;
  points_possible?: number | null;
  html_url?: string | null;
  planner_override?: CanvasPlannerOverride | null;
}

export interface CanvasSyllabus {
  courseId: CanvasId;
  courseName: string;
  syllabusBody?: string | null;
}

export interface CanvasModuleItemCompletionRequirement {
  type?: string | null;
  min_score?: number | null;
  completed?: boolean | null;
}

export interface CanvasModuleItem {
  id: CanvasId;
  title: string;
  type?: string | null;
  position?: number | null;
  html_url?: string | null;
  completion_requirement?: CanvasModuleItemCompletionRequirement | null;
  completed?: boolean | null;
}

export interface CanvasModule {
  id: CanvasId;
  name: string;
  position?: number | null;
  state?: string | null;
  items_count?: number;
  items: CanvasModuleItem[];
}

export interface CanvasGradeSummary {
  courseId: CanvasId;
  courseName: string;
  enrollmentState?: string;
  currentScore?: number | null;
  currentGrade?: string | null;
  finalScore?: number | null;
  finalGrade?: string | null;
  currentPeriodScore?: number | null;
  currentPeriodGrade?: string | null;
}

export interface CanvasUpcomingItem {
  kind: "assignment" | "event";
  id: CanvasId;
  title: string;
  date?: string | null;
  courseId?: CanvasId | null;
  courseName?: string | null;
  htmlUrl?: string | null;
  details?: string | null;
  status?: CanvasSubmissionStatus;
}

export interface CanvasHealthCheck {
  ok: boolean;
  baseUrl: string;
  currentUser: Pick<CanvasUser, "id" | "name" | "short_name">;
  observedUsers: Array<Pick<CanvasUser, "id" | "name" | "short_name">>;
  defaultObservedUserId?: CanvasId | null;
  message: string;
}
