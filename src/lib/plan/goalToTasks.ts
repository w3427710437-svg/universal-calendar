import type { GoalSpec, TaskType } from "./types";

export type TaskTemplate = {
  title: string;
  type: Exclude<TaskType, "rest">;
  totalHours: number;
};

export type TaskPlanTemplate = {
  milestones: TaskTemplate[];
  works: TaskTemplate[];
  totalRequiredHours: number;
};

function daysInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function classifyGoal(description: string) {
  const s = description.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));

  if (has("小程序", "前端", "react", "vue", "typescript", "开发", "接口", "上线")) return "software";
  if (has("减肥", "健身", "跑步", "饮食", "瑜伽", "训练")) return "fitness";
  if (has("考研", "英语", "数学", "政治", "背诵", "复习", "模考")) return "exam";
  return "generic";
}

export function goalToTaskPlanTemplate(spec: GoalSpec): TaskPlanTemplate {
  const daysCount = Math.max(1, daysInclusive(spec.startDate, spec.endDate));
  const weeksCount = Math.max(1, Math.ceil(daysCount / 7));

  // 利用率因子：确保我们排程器不会每天都满载导致“不可行”
  const utilizationFactor = 0.8;
  const totalRequiredHours = spec.weeklyHours * weeksCount * utilizationFactor;

  const milestoneCount = Math.max(1, Math.floor(spec.milestoneCount || 3));
  const milestoneTotal = totalRequiredHours * 0.25;
  const workTotal = totalRequiredHours - milestoneTotal;

  const goalType = classifyGoal(spec.description);
  const milestoneTitles = Array.from({ length: milestoneCount }).map((_, i) => `阶段里程碑 ${i + 1}`);

  let workTitles: [string, string, string];
  if (goalType === "software") {
    workTitles = ["需求调研与方案设计", "开发实现（迭代推进）", "测试与上线交付"];
  } else if (goalType === "fitness") {
    workTitles = ["计划与准备（作息/饮食/基线）", "核心训练（逐步加量）", "复盘与调整（提升可持续性）"];
  } else if (goalType === "exam") {
    workTitles = ["知识梳理与框架建立", "刷题强化与查漏补缺", "模考/背诵复盘与总结"];
  } else {
    workTitles = ["调研与拆解（明确范围/路径）", "执行推进（按日推进交付）", "复盘总结（质量检查/迭代）"];
  }

  const milestones: TaskTemplate[] = milestoneTitles.map((title) => ({
    title,
    type: "milestone",
    totalHours: milestoneTotal / milestoneCount,
  }));

  // 三段式占比：避免任务过于细碎（更适合作业展示）
  const workDurations = [
    workTotal * 0.25,
    workTotal * 0.55,
    Math.max(0, workTotal * 0.2),
  ];

  const works: TaskTemplate[] = [
    { title: workTitles[0], type: "work", totalHours: workDurations[0] },
    { title: workTitles[1], type: "work", totalHours: workDurations[1] },
    { title: workTitles[2], type: "work", totalHours: workDurations[2] },
  ];

  return { milestones, works, totalRequiredHours };
}

