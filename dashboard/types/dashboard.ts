export type TaskCategory =
  | "feature"
  | "bug-fix"
  | "first-build"
  | "refactor"
  | "analysis"
  | "chore";

export type TaskStatus =
  | "planned"
  | "confirmed"
  | "executing"
  | "completed"
  | "failed";

export interface TaskLogEntry {
  timestamp: string;
  text: string;
  type: "info" | "error" | "success";
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  projectId?: string;
  projectName?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  executionLog: TaskLogEntry[];
  source: "manual" | "overnight-suggestion";
  priority?: "HIGH" | "MED" | "LOW";
  effort?: "S" | "M" | "L";
}

export interface TasksState {
  items: Task[];
}

export type InboxItemType =
  | "jira"
  | "teams"
  | "ai-suggestion"
  | "standing"
  | "free-form"
  | "recurring"
  | "jira-comment"
  | "doc-comment";

export interface InboxItem {
  id: string;
  title: string;
  type: InboxItemType;
  source: string;
  link?: string;
  slaDeadline?: string;
  deadlineLabel?: string;
  jiraKey?: string;
  priority?: "urgent" | "today" | "backlog";
  addedAt: string;
  // jira-comment fields
  commentId?: string;
  commentAuthor?: string;
  commentSnippet?: string;
  // doc-comment fields
  filePath?: string;
  fileUrl?: string;
  driveItemId?: string;
  driveId?: string;
  commentObjectId?: string;
  // ai-suggestion fields (setup suggestions from morning scan)
  installCommand?: string;
  reasoning?: string;
}

export interface PriorityInbox {
  urgent: InboxItem[];
  aiSuggested: InboxItem[];
  today: InboxItem[];
  backlog: InboxItem[];
}

export type ProjectPhase = "Backlog" | "Building" | "Review" | "Done";

export interface ProjectSuggestion {
  priority: "HIGH" | "MED" | "LOW";
  action: string;
  effort: "S" | "M" | "L";
}

export interface PersonalProject {
  id: string;
  name: string;
  description: string;
  phase: ProjectPhase;
  completionPercent: number;
  dir?: string;
  gitDir?: string;
  devDocsDir?: string;
  tags: string[];
  lastActivity?: string;
  suggestions?: ProjectSuggestion[];
  state?: string;
  crossProjectDeps?: string[];
  neglected?: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isFocusBlock: boolean;
  isCompleted: boolean;
}

export interface TimeSession {
  id: string;
  label: string;
  jiraKey?: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
  notes?: string;
  planned?: boolean;
  source?: "manual" | "day-plan";
}

export interface ActiveSession {
  id: string;
  label: string;
  jiraKey?: string;
  startedAt: string;
}

export interface TimeTracker {
  activeSession: ActiveSession | null;
  todaySessions: TimeSession[];
  plannedSessions?: TimeSession[];
  plannedTodayMinutes?: number;
  todayTotalMinutes: number;
  weekTotalMinutes: number;
}

export interface OvernightProjectAnalysis {
  state: string;
  suggestions: ProjectSuggestion[];
  neglected: string[];
  crossProjectDeps: string[];
}

export interface RecommendedInstall {
  id: string;
  name: string;
  category: "MCP" | "Plugin" | "VSCode" | "npm" | "App" | "Architecture";
  priority: "HIGH" | "MED" | "LOW";
  description: string;
  signal: string;
  installCommand?: string;
  integratesWith?: string[];
  status: "PENDING" | "INSTALLED" | "SKIPPED";
  addedAt: string;
}

export interface RecommendedInstalls {
  lastUpdated: string | null;
  items: RecommendedInstall[];
}

export interface NoteEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocHealthItem {
  id: string;
  project: string;
  filePath: string;
  reason: string;
  daysSinceUpdate: number;
  lastModified: string;
  priority: "HIGH" | "MED" | "LOW";
}

export type AutomationRuleStatus =
  | "pending"
  | "deployed"
  | "blocked"
  | "disabled";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  project: string;
  phase: string;
  status: AutomationRuleStatus;
  blockedReason?: string;
  deployedAt?: string;
  jiraLink?: string;
  verificationCheck?: string;
}

export interface ProjectEntry {
  name: string;
  path: string;
  phase: ProjectPhase;
  lastCommit: string | null;
  lastCommitMsg: string | null;
  description: string | null;
  hasGit: boolean;
  hasClaude: boolean;
  hasPkg: boolean;
}

export interface TeamMessage {
  id: string;
  from: string;
  preview: string;
  chatUrl: string;
  unreadCount: number;
  receivedAt: string;
}

export interface FlaggedEmail {
  id: string;
  subject: string;
  from: string;
  webLink: string;
  receivedAt: string;
}

export interface NewsletterEmail {
  id: string;
  subject: string;
  from: string;
  fromAddress: string;
  webLink: string;
  receivedAt: string;
  preview: string;
  sourceType: "internal" | "external";
}

export type DayPlanBlockType = "focus" | "admin" | "meeting" | "buffer";

export interface DayPlanBlock {
  time: string;
  duration: number;
  task: string;
  type: DayPlanBlockType;
  booked: boolean;
  rationale?: string;
}

export interface DayPlan {
  generatedAt: string;
  accepted: boolean;
  blocks: DayPlanBlock[];
}

export interface ActivitySession {
  start: string;
  end: string;
  windowTitle: string;
  inferredTask: string | null;
  durationMin: number;
}

export type InternalIntelSourceType = "teams" | "confluence" | "newsletter";

export interface InternalIntelItem {
  title: string;
  summary: string;
  sourceType: InternalIntelSourceType;
  url?: string;
}

export interface InternalIntelligence {
  teamsChannels: InternalIntelItem[];
  confluencePages: InternalIntelItem[];
  newsletterHighlights: InternalIntelItem[];
}

export interface PopularRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  url: string;
  stars: number;
  description: string | null;
  language: string | null;
  topics: string[];
  updatedAt: string;
}

export interface AiNewsResults {
  lastRun: string | null;
  topStories: Array<{
    title: string;
    summary: string;
    url?: string;
    publishedAt?: string;
    source?: string;
  }>;
  suggestions: string[];
  internalIntel?: InternalIntelligence;
  popularRepos?: PopularRepo[];
}

export type FeedbackStatus = "inbox" | "accepted" | "denied";

export interface FeedbackItem {
  id: string;
  text: string;
  source: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface DashboardData {
  meta: {
    version: string;
    lastUpdated: string | null;
    lastUpdatedBy: string | null;
  };
  priorityInbox: PriorityInbox;
  personalProjects: {
    lastRefreshed: string | null;
    projects: PersonalProject[];
  };
  calendar: {
    lastRefreshed: string | null;
    hasToken: boolean;
    today: CalendarEvent[];
    weekAhead: CalendarEvent[];
  };
  timeTracker: TimeTracker;
  overnightAnalysis: {
    generatedAt: string | null;
    projects: Record<string, OvernightProjectAnalysis>;
  };
  tasks: TasksState;
  automationRules: {
    lastChecked: string | null;
    rules: AutomationRule[];
  };
  projectRegistry: ProjectEntry[];
  teamMessages: TeamMessage[];
  teamMessagesFetchedAt?: string | null;
  flaggedEmails: FlaggedEmail[];
  flaggedEmailsFetchedAt?: string | null;
  dayPlan: DayPlan | null;
  activityLog: ActivitySession[];
  aiNewsResults: AiNewsResults | null;
  lastActivitySync: string | null;
  recommendedInstalls: RecommendedInstalls;
  notes?: {
    items: NoteEntry[];
    lastUpdated: string | null;
  };
  docHealth?: {
    lastRun: string | null;
    staleDocs: DocHealthItem[];
  };
  ibp?: {
    lastGenerated: string | null;
    availableDates: string[];
  };
  feedback?: {
    items: FeedbackItem[];
  };
}
