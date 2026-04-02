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
  | "recurring";

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
  todayTotalMinutes: number;
  weekTotalMinutes: number;
}

export interface OvernightProjectAnalysis {
  state: string;
  suggestions: ProjectSuggestion[];
  neglected: string[];
  crossProjectDeps: string[];
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
}
