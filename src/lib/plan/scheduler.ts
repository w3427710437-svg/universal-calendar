import dayjs from "dayjs";
import type { GoalSpec, PlanResult, TaskItem } from "./types";
import { isTraditionalFestival } from "../calendar";
import type { TaskPlanTemplate, TaskTemplate } from "./goalToTasks";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isWeekend(date: string) {
  const d = dayjs(date);
  const day = d.day(); // 0=Sunday, 6=Saturday
  return day === 0 || day === 6;
}

function iterateDates(startDate: string, endDate: string) {
  const start = dayjs(`${startDate}T00:00:00`);
  const end = dayjs(`${endDate}T00:00:00`);
  const days: string[] = [];
  for (let cur = start; cur.isBefore(end) || cur.isSame(end); cur = cur.add(1, "day")) {
    days.push(cur.format("YYYY-MM-DD"));
  }
  return days;
}

async function filterAvailableDates(spec: GoalSpec) {
  const allDates = iterateDates(spec.startDate, spec.endDate);
  const availableDates: string[] = [];

  for (const date of allDates) {
    if (spec.avoidWeekends && isWeekend(date)) continue;
    if (spec.avoidHolidays && isTraditionalFestival(date)) continue;
    availableDates.push(date);
  }
  return availableDates;
}

function allocateTaskToDates(args: {
  task: TaskTemplate;
  startDateIndex: number;
  dailyHours: number;
  availableDates: string[];
  getAndIncId: () => string;
  maxTotalHoursToAllocate: number; // 上限（用于不可行诊断时截断）
}) {
  const { task, startDateIndex, dailyHours, availableDates, getAndIncId, maxTotalHoursToAllocate } = args;

  const items: TaskItem[] = [];
  if (dailyHours <= 0 || availableDates.length === 0 || maxTotalHoursToAllocate <= 0) {
    return { items, lastUsedIndex: startDateIndex - 1 };
  }

  let remaining = Math.min(task.totalHours, maxTotalHoursToAllocate);
  let i = startDateIndex;
  while (remaining > 1e-9 && i < availableDates.length) {
    const alloc = Math.min(dailyHours, remaining);
    const date = availableDates[i];
    items.push({
      id: getAndIncId(),
      date,
      title: task.title,
      type: task.type,
      durationHours: round2(alloc),
    });
    remaining = round2(remaining - alloc);
    i++;
  }

  const lastUsedIndex = i - 1; // 可能是 startDateIndex - 1（无分配）
  return { items, lastUsedIndex };
}

export async function generatePlanByRules(spec: GoalSpec, template: TaskPlanTemplate): Promise<PlanResult> {
  const dailyHours = spec.weeklyHours / (spec.avoidWeekends ? 5 : 7);
  const availableDates = await filterAvailableDates(spec);
  const totalAvailableHours = round2(availableDates.length * dailyHours);

  const totalRequiredHours = round2(template.totalRequiredHours);
  const feasible = totalAvailableHours + 1e-9 >= totalRequiredHours;

  const missingHours = feasible ? undefined : round2(totalRequiredHours - totalAvailableHours);

  const maxAllocatableHours = feasible ? totalRequiredHours : totalAvailableHours;

  // 用于不可行时“最多生成能排的部分”
  let remainingGlobalBudget = maxAllocatableHours;

  const getAndIncId = (() => {
    let counter = 0;
    return () => `task-${counter++}`;
  })();

  const milestonesCount = template.milestones.length;
  const availableLen = availableDates.length;

  const items: TaskItem[] = [];
  let lastUsedIndex = 0;

  // 1) 先排里程碑（按预设位置尽量靠近）
  for (let i = 0; i < milestonesCount; i++) {
    const m = template.milestones[i];
    const idealIndex = Math.round(((i + 1) / (milestonesCount + 1)) * (availableLen - 1));
    const startIndex = Math.max(lastUsedIndex, idealIndex);
    const { items: segmentItems, lastUsedIndex: segLastIndex } = allocateTaskToDates({
      task: m,
      startDateIndex: startIndex,
      dailyHours,
      availableDates,
      getAndIncId,
      maxTotalHoursToAllocate: remainingGlobalBudget,
    });
    items.push(...segmentItems);
    const usedHours = round2(segmentItems.reduce((sum, it) => sum + it.durationHours, 0));
    remainingGlobalBudget = round2(remainingGlobalBudget - usedHours);
    if (remainingGlobalBudget <= 1e-9) break;
    lastUsedIndex = Math.max(lastUsedIndex, segLastIndex + 1);
  }

  // 2) 再排工作任务（从 lastUsedIndex 开始顺序填充）
  for (const w of template.works) {
    if (remainingGlobalBudget <= 1e-9) break;
    const { items: segmentItems, lastUsedIndex: segLastIndex } = allocateTaskToDates({
      task: w,
      startDateIndex: lastUsedIndex,
      dailyHours,
      availableDates,
      getAndIncId,
      maxTotalHoursToAllocate: remainingGlobalBudget,
    });
    items.push(...segmentItems);
    const usedHours = round2(segmentItems.reduce((sum, it) => sum + it.durationHours, 0));
    remainingGlobalBudget = round2(remainingGlobalBudget - usedHours);
    lastUsedIndex = Math.max(lastUsedIndex, segLastIndex + 1);
  }

  const diagnostics = {
    feasible,
    totalRequiredHours,
    totalAvailableHours,
    missingHours,
  };

  return {
    items,
    diagnostics,
    meta: { source: "rule" },
  };
}

