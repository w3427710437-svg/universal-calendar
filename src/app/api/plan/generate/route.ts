import { NextResponse } from "next/server";
import { z } from "zod";
import dayjs from "dayjs";
import type { GoalSpec, PlanResult, TaskItem } from "@/lib/plan/types";

async function loadDashscopeConfigFromPythonClient(): Promise<{ apiKey?: string; baseUrl?: string } | null> {
  // 兼容你现有的 Python 调用方式：`d:/rili/llm_client.py` 里直接配置了 api_key/base_url
  // Next dev 时如果未配置 env，这里尝试从该文件解析出来（仅用于本地开发）
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.resolve(process.cwd(), "..", "llm_client.py");
    const txt = await fs.readFile(filePath, "utf-8");
    const keyMatch = /api_key\s*=\s*["']([^"']+)["']/.exec(txt);
    const urlMatch = /base_url\s*=\s*["']([^"']+)["']/.exec(txt);
    return { apiKey: keyMatch?.[1], baseUrl: urlMatch?.[1] };
  } catch {
    return null;
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

async function getAvailableDates(spec: GoalSpec) {
  const allDates = iterateDates(spec.startDate, spec.endDate);
  const availableDates: string[] = [];
  for (const date of allDates) {
    // 与 scheduler.ts 的周末过滤保持一致
    if (spec.avoidWeekends) {
      const d = dayjs(date);
      const day = d.day(); // 0=Sunday, 6=Saturday
      if (day === 0 || day === 6) continue;
    }
    availableDates.push(date);
  }
  return availableDates;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function sumDurationHours(items: TaskItem[]): number {
  return round2(items.reduce((s, it) => s + it.durationHours, 0));
}

function scaleItemsToTargetTotal(items: TaskItem[], targetTotalHours: number): TaskItem[] {
  const current = sumDurationHours(items);
  if (current <= 1e-9) return items;
  const factor = targetTotalHours / current;
  const scaled = items.map((it) => ({ ...it, durationHours: round2(it.durationHours * factor) }));
  const scaledSum = sumDurationHours(scaled);
  const diff = round2(targetTotalHours - scaledSum);
  if (Math.abs(diff) > 1e-9 && scaled.length > 0) {
    const lastIdx = scaled.length - 1;
    scaled[lastIdx] = { ...scaled[lastIdx], durationHours: round2(scaled[lastIdx].durationHours + diff) };
  }
  return scaled;
}

function classifyGoal(description: string): "software" | "fitness" | "exam" | "generic" {
  const s = description.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));
  if (has("小程序", "前端", "react", "vue", "typescript", "开发", "接口", "上线")) return "software";
  if (has("减肥", "健身", "跑步", "饮食", "瑜伽", "训练")) return "fitness";
  if (has("考研", "英语", "数学", "政治", "背诵", "复习", "模考")) return "exam";
  return "generic";
}

function truncateTitle(s: string, maxLen: number) {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function generateItemsBySplit(args: {
  goalDescription: string;
  availableDates: string[];
  dailyHours: number;
  totalAvailableHours: number;
}): TaskItem[] {
  const { goalDescription, availableDates, dailyHours, totalAvailableHours } = args;
  if (!availableDates.length || dailyHours <= 0 || totalAvailableHours <= 0) return [];

  const targetTotalHours = round2(totalAvailableHours * 0.95);

  const goalType = classifyGoal(goalDescription);
  const workTitlesByType: Record<string, [string, string, string]> = {
    software: ["需求梳理与方案确认", "开发推进（迭代实现）", "测试与上线交付"],
    fitness: ["计划与基础训练（作息/饮食/基线）", "核心训练推进（逐步加量）", "复盘与调整（提升可持续性）"],
    exam: ["知识梳理与框架建立", "刷题强化与查漏补缺", "模考/背诵复盘与总结"],
    generic: ["拆解与规划（明确范围/路径）", "执行推进（按日落实）", "复盘总结（质量检查/迭代）"],
  };
  const cycleTitles = workTitlesByType[goalType];

  // 兜底也保证每个可用日期都有至少一条任务，然后用缩放把总工时调回 <= 95% 容量。
  const perDay = targetTotalHours / availableDates.length;
  const base = round2(Math.min(dailyHours, Math.max(0.25, perDay)));

  const items: TaskItem[] = availableDates.map((date, i) => {
    const titleBase = cycleTitles[i % cycleTitles.length];
    return {
      id: `task-${i}-${date}`,
      date,
      type: "work",
      title: `${titleBase}（目标：${truncateTitle(goalDescription, 18)}）`,
      durationHours: round2(base),
    };
  });

  return scaleItemsToTargetTotal(items, targetTotalHours);
}

const LlmItemsSchema = z
  .object({
    items: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: z.string().min(1).max(120),
        // LLM 输出不保证严格等于 "work"，这里放宽解析，后端统一映射为 work
        type: z.string().optional(),
        durationHours: z.coerce.number().min(0.1).max(24),
        notes: z.string().max(4000).optional(),
      })
    ),
  })
  .strict();

function pickAnchorDates(availableDates: string[], segmentCount: number) {
  if (!availableDates.length) return [];
  const n = Math.min(Math.max(2, segmentCount), Math.min(7, availableDates.length));
  if (n === 1) return [availableDates[0]];
  const anchors: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (availableDates.length - 1));
    anchors.push(availableDates[idx]);
  }
  // 去重（极短列表时可能重复）
  return Array.from(new Set(anchors));
}

function ensureItemsCoverage(args: {
  items: TaskItem[];
  requiredDates: string[];
  dailyHours: number;
  goalDescription: string;
  minItemsPerDate: number;
}): TaskItem[] {
  const { items, requiredDates, dailyHours, goalDescription, minItemsPerDate } = args;
  const byDate = new Map<string, number>();
  for (const it of items) {
    byDate.set(it.date, (byDate.get(it.date) ?? 0) + 1);
  }

  const minPerDay = round2(Math.min(dailyHours, 0.5));
  const titleHint = truncateTitle(goalDescription, 24);
  const goalType = classifyGoal(goalDescription);
  const fillTemplates: Record<string, string[]> = {
    software: ["梳理需求与验收标准", "实现核心功能并自测", "整理问题清单并修复", "准备演示与提交材料"],
    fitness: ["安排训练计划并记录数据", "完成核心训练并拉伸", "复盘饮食与睡眠并调整", "总结本周表现并设定下次目标"],
    exam: ["整理知识框架并做笔记", "刷题并标注错题", "复盘错题并总结方法", "做一次小测并复盘"],
    generic: ["收集资料并列出清单", "推进关键产出并落稿", "检查问题并修订完善", "整理结论并准备展示"],
  };

  const next: TaskItem[] = [...items];
  for (const date of requiredDates) {
    const count = byDate.get(date) ?? 0;
    const need = Math.max(0, minItemsPerDate - count);
    for (let i = 0; i < need; i++) {
      const list = fillTemplates[goalType] ?? fillTemplates.generic;
      const tpl = list[(count + i) % list.length];
      next.push({
        id: `task-ai-missing-${date}-${i}`,
        date,
        type: "work",
        durationHours: minPerDay > 0 ? minPerDay : 0.25,
        title: `${tpl}（目标：${titleHint}）`,
      });
    }
  }
  return next;
}

async function generateItemsByLLM(args: {
  goalDescription: string;
  startDate: string;
  endDate: string;
  avoidWeekends: boolean;
  availableDates: string[];
  dailyHours: number;
  totalAvailableHours: number;
  mode: "daily" | "segment";
}): Promise<PlanResult["items"]> {
  const { goalDescription, startDate, endDate, availableDates, dailyHours, totalAvailableHours, mode } = args;

  let apiKey = process.env.DASHSCOPE_API_KEY || process.env.AI_API_KEY;
  let baseUrl = process.env.DASHSCOPE_BASE_URL;
  if (!apiKey) {
    const cfg = await loadDashscopeConfigFromPythonClient();
    if (cfg?.apiKey) apiKey = cfg.apiKey;
    if (!baseUrl && cfg?.baseUrl) baseUrl = cfg.baseUrl;
  }
  if (!apiKey) throw new Error("AI_API_KEY not set");

  const model = process.env.DASHSCOPE_MODEL || "qwen3-max";
  const endpoint = `${baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1"}/chat/completions`;

  if (!availableDates.length) throw new Error("No available dates for this range");
  if (totalAvailableHours <= 1e-9) throw new Error("Not enough capacity");

  const systemPrompt =
    "你是一个严谨的计划生成器。只能输出合法 JSON，不能输出任何解释/前言/markdown/多余文本。JSON 必须严格匹配 schema。不要在任务标题里写具体日期。";

  const segmentCount = Math.min(7, Math.max(6, Math.ceil(availableDates.length / 10))); // 6-7 段
  const anchorDates = mode === "segment" ? pickAnchorDates(availableDates, segmentCount) : [];

  const userPrompt = [
    mode === "segment"
      ? "根据以下输入生成一个“按关键时间节点落地”的阶段计划（最多 6-7 段）。每段对应一个时间节点，给出阶段标题+清单（notes）。"
      : "根据以下输入生成一个“按日期落地”的日计划。",
    "",
    "输入：",
    `- 目标：${goalDescription}`,
    `- 区间：${startDate} ~ ${endDate}`,
    `- 避开周末：${args.avoidWeekends}`,
    `- 可用日期列表：${JSON.stringify(availableDates)}`,
    `- 可用日期数量：${availableDates.length}`,
    ...(mode === "segment" ? [`- 关键节点日期（只能从中选择 date）：${JSON.stringify(anchorDates)}`] : []),
    `- 每个可用日的理论容量 dailyHours：${round2(dailyHours)}（不要明显超出）`,
    `- 区间总可用工时 totalAvailableHours：${round2(totalAvailableHours)}（所有 tasks 的 durationHours 之和尽量不超过它）`,
    "",
    "输出 JSON schema：",
    "{",
    '  "items": [',
    mode === "segment"
      ? '    { "date": "YYYY-MM-DD", "title": "阶段标题（中文）", "durationHours": number, "notes": "阶段清单/交付物（多行也行）" }'
      : '    { "date": "YYYY-MM-DD", "title": "中文可执行任务标题", "durationHours": number }',
    "  ]",
    "}",
    "",
    "硬性约束：",
    ...(mode === "segment"
      ? [
          "1) items 只能使用给定的关键节点日期作为 date（必须严格属于关键节点列表）。",
          "2) items 数量为 6-7 条（若关键节点不足则按实际数量输出）。",
          "3) title 必须强相关目标，体现阶段性推进（例如：调研/方案/产出/检查/演练/交付）。",
          "4) notes 必须包含可执行清单/交付物/验收点，尽量用多行或清单形式。",
          "5) durationHours 为该阶段预计投入（小时），总和尽量不超过 totalAvailableHours。",
          "6) 只输出 JSON，不要输出任何其它文本。",
        ]
      : [
          "1) items.date 必须严格属于可用日期列表，且 items 必须覆盖所有可用日期。",
          "2) 每个可用日期至少输出 2 条任务、最多 4 条任务。",
          "3) title 必须强相关目标，包含明确动作 + 交付物/验收点。",
          "4) durationHours 为每条任务预计时长（小时），同一天总和不要明显超过 dailyHours 的 1.2 倍。",
          "5) 只输出 JSON，不要输出任何其它文本。",
        ]),
    "",
    "开始生成 JSON。",
  ].join("\n");

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.25,
    }),
  });

  type LlmChatCompletionsResponse = {
    error?: { message?: string };
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  const data = (await resp.json().catch(() => ({}))) as LlmChatCompletionsResponse;
  if (!resp.ok) {
    const msg = data?.error?.message || data?.message || `LLM request failed: status ${resp.status}`;
    throw new Error(String(msg));
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("LLM returned no message content");

  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) throw new Error("Failed to extract JSON object from LLM content");

  const raw = JSON.parse(jsonText);
  const payload = Array.isArray(raw) ? { items: raw } : raw;
  const parsed = LlmItemsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid LLM JSON shape: ${parsed.error.message}`);
  }

  const out = parsed.data;
  // 由后端补 id + 校验日期集合
  const allowed = new Set(availableDates);
  const items: TaskItem[] = out.items.map((it, idx) => {
    if (!allowed.has(it.date)) throw new Error(`LLM returned disallowed date: ${it.date}`);
    const duration = round2(it.durationHours);
    return {
      id: `task-${idx}-${it.date}`,
      date: it.date,
      title: it.title,
      type: "work",
      durationHours: duration,
      notes: it.notes,
    };
  });
  return items;
}

const BodySchema = z
  .object({
    description: z.string().min(1).max(2000),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weeklyHours: z.coerce.number().min(0.1).max(1000),
    avoidWeekends: z.boolean(),
    avoidHolidays: z.boolean(),
    milestoneCount: z.coerce.number().int().min(1).max(12).optional().default(3),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must be >= startDate",
    path: ["endDate"],
  });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const spec: GoalSpec = parsed.data;
  // 需要在 try/catch 两侧复用
  let totalAvailableHours = 0;
  let aiError: string | undefined = undefined;
  let aiUsed = false;

  try {
    // 1) 先计算当前区间可用容量（用于提示 LLM“上限”）
    const dailyHours = spec.weeklyHours / (spec.avoidWeekends ? 5 : 7);
    const availableDates = await getAvailableDates(spec);
    totalAvailableHours = round2(availableDates.length * dailyHours);
    const totalDays = iterateDates(spec.startDate, spec.endDate).length;
    const mode: "daily" | "segment" = totalDays >= 21 ? "segment" : "daily";

    // 2) 可选：LLM 直接生成“按日期落地”的 items（不需要里程碑/模板）
    const pythonCfg = await loadDashscopeConfigFromPythonClient();
    const hasAiKey = Boolean(process.env.DASHSCOPE_API_KEY || process.env.AI_API_KEY || pythonCfg?.apiKey);
    if (hasAiKey) {
      aiUsed = true;
      try {
        let items = await generateItemsByLLM({
          goalDescription: spec.description,
          startDate: spec.startDate,
          endDate: spec.endDate,
          avoidWeekends: spec.avoidWeekends,
          availableDates,
          dailyHours,
          totalAvailableHours,
          mode,
        });

        // 覆盖策略：
        // - daily：每个可用日期至少 2 条
        // - segment：每个关键节点至少 1 条
        const requiredDates =
          mode === "segment"
            ? pickAnchorDates(availableDates, Math.min(7, Math.max(6, Math.ceil(availableDates.length / 10))))
            : availableDates;
        items = ensureItemsCoverage({
          items,
          requiredDates,
          dailyHours,
          goalDescription: spec.description,
          minItemsPerDate: mode === "segment" ? 1 : 2,
        });

        const plannedTotalHours = sumDurationHours(items);
        // 为了让“生成计划”体验稳定：即使 LLM 超出容量，也自动缩放到 <= 95% 容量
        const targetTotalHours = round2(Math.min(plannedTotalHours, totalAvailableHours * 0.95));
        const normalizedItems =
          plannedTotalHours > totalAvailableHours * 0.95 ? scaleItemsToTargetTotal(items, targetTotalHours) : items;
        const normalizedTotalHours = sumDurationHours(normalizedItems);
        const diagnostics = {
          feasible: true,
          totalRequiredHours: normalizedTotalHours,
          totalAvailableHours,
          ai: { used: true },
        };

        const result: PlanResult = {
          items: normalizedItems,
          diagnostics,
          meta: { source: "ai_optional" },
        };
        return NextResponse.json(result, { status: 200 });
      } catch (e) {
        aiError = String(e);
        // AI失败后继续走兜底分支，但把错误信息带回前端用于定位
      }
    }

    // 3) 兜底：直接按可用日期拆分成 daily tasks（保证“计划页有内容、能落到每天”）
    const items =
      mode === "segment"
        ? pickAnchorDates(availableDates, Math.min(7, Math.max(6, Math.ceil(availableDates.length / 10)))).map(
            (date, i) => ({
              id: `seg-${i}-${date}`,
              date,
              type: "work" as const,
              title: `阶段 ${i + 1}：推进与检查（目标：${truncateTitle(spec.description, 18)}）`,
              durationHours: round2((totalAvailableHours * 0.95) / Math.max(1, Math.min(7, Math.max(6, Math.ceil(availableDates.length / 10))))),
              notes: "（兜底生成）建议：列出本阶段交付物/检查点/风险与下一步。",
            })
          )
        : generateItemsBySplit({
            goalDescription: spec.description,
            availableDates,
            dailyHours,
            totalAvailableHours,
          });
    const plannedTotalHours = sumDurationHours(items);
    const result: PlanResult = {
      items,
      diagnostics: {
        feasible: true,
        totalRequiredHours: plannedTotalHours,
        totalAvailableHours,
        ai: { used: aiUsed, error: aiError },
      },
      meta: { source: "rule" },
    };
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    // AI/校验失败也要尽量返回可交付结果
    try {
      const availableDatesFallback = await getAvailableDates(spec);
      const dailyHoursFallback = spec.weeklyHours / (spec.avoidWeekends ? 5 : 7);
      const totalAvailableHoursFallback = round2(availableDatesFallback.length * dailyHoursFallback);

      const items = generateItemsBySplit({
        goalDescription: spec.description,
        availableDates: availableDatesFallback,
        dailyHours: dailyHoursFallback,
        totalAvailableHours: totalAvailableHoursFallback,
      });

      const plannedTotalHours = sumDurationHours(items);
      const result: PlanResult = {
        items,
        diagnostics: {
          feasible: true,
          totalRequiredHours: plannedTotalHours,
          totalAvailableHours: totalAvailableHoursFallback,
          ai: { used: false, error: String(e) },
        },
        meta: { source: "rule" },
      };
      return NextResponse.json(result, { status: 200 });
    } catch {
      return NextResponse.json({ error: "Failed to generate plan", details: String(e) }, { status: 500 });
    }
  }
}

