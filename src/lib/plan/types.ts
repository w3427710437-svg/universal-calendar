export type GoalSpec = {
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weeklyHours: number;
  avoidWeekends: boolean;
  avoidHolidays: boolean; // 基于 lunar-javascript 返回的传统节日（不做法定调休）
  milestoneCount: number; // 默认 3
};

export type TaskType = "work" | "rest" | "milestone";

export type TaskItem = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: TaskType;
  durationHours: number;
  notes?: string;
};

export type PlanDiagnostics = {
  feasible: boolean;
  totalRequiredHours: number;
  totalAvailableHours: number;
  missingHours?: number;
  conflicts?: string[];
  ai?: { used: boolean; error?: string };
};

export type PlanResult = {
  items: TaskItem[];
  diagnostics: PlanDiagnostics;
  meta: { source: "rule" | "ai_optional" };
};

