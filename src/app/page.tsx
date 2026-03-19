"use client";

import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { LunarToSolarResult, SolarToLunarResult } from "@/lib/calendar";
import type { GoalSpec, PlanResult, TaskItem, TaskType } from "@/lib/plan/types";

type TabKey = "conversion" | "plan";

function badgeColor(type: TaskType) {
  if (type === "milestone") return "bg-purple-100 text-purple-800 border-purple-200";
  if (type === "rest") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-sky-100 text-sky-800 border-sky-200";
}

function CalendarGrid(props: {
  monthDate: string; // YYYY-MM-01
  items: TaskItem[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const { monthDate, items, selectedDate, onSelectDate } = props;

  const cells = useMemo(() => {
    const first = dayjs(monthDate).startOf("month");
    const weekIndexMon0 = (first.day() + 6) % 7; // Monday=0
    const gridStart = first.subtract(weekIndexMon0, "day");
    return Array.from({ length: 42 }).map((_, i) => gridStart.add(i, "day").format("YYYY-MM-DD"));
  }, [monthDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const it of items) {
      const arr = map.get(it.date) ?? [];
      arr.push(it);
      map.set(it.date, arr);
    }
    return map;
  }, [items]);

  return (
    <div className="border rounded-lg bg-white">
      <div className="grid grid-cols-7 gap-1 p-3 text-xs text-slate-500">
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((h) => (
          <div key={h} className="text-center">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 p-3 pt-0">
        {cells.map((date) => {
          const cur = dayjs(date);
          const inMonth = cur.month() === dayjs(monthDate).month();
          const taskList = byDate.get(date) ?? [];
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              className={[
                "min-h-[56px] rounded-md border text-left p-2 hover:bg-slate-50 transition",
                inMonth ? "bg-white" : "bg-slate-50",
                isSelected ? "ring-2 ring-sky-500 border-sky-200" : "border-slate-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className={inMonth ? "text-slate-800 font-medium" : "text-slate-400 font-medium"}>
                  {cur.date()}
                </span>
                {taskList.length > 0 ? (
                  <span className="text-[11px] text-slate-500">{taskList.length}</span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {taskList.slice(0, 3).map((it) => (
                  <span
                    key={it.id}
                    className={[
                      "border px-1.5 py-0.5 rounded text-[11px] font-medium",
                      badgeColor(it.type),
                    ].join(" ")}
                    title={`${it.title} (${it.durationHours}h)`}
                  >
                    {it.type === "milestone" ? "里程碑" : "任务"}
                  </span>
                ))}
                {taskList.length > 3 ? (
                  <span className="border border-slate-200 px-1.5 py-0.5 rounded text-[11px] text-slate-600">
                    +{taskList.length - 3}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConversionPanel() {
  const [tab, setTab] = useState<"solarToLunar" | "lunarToSolar">("solarToLunar");

  // 阳历 -> 阴历
  const today = dayjs().format("YYYY-MM-DD");
  const [solarDate, setSolarDate] = useState<string>(today);
  const [solarLoading, setSolarLoading] = useState(false);
  const [solarResult, setSolarResult] = useState<SolarToLunarResult | null>(null);
  const [solarError, setSolarError] = useState<string | null>(null);

  // 阴历 -> 阳历
  const [lunarYear, setLunarYear] = useState<number>(dayjs().year());
  const [lunarMonth, setLunarMonth] = useState<number>(1);
  const [lunarDay, setLunarDay] = useState<number>(1);
  const [lunarLeap, setLunarLeap] = useState<boolean>(false);
  const [lunarLoading, setLunarLoading] = useState(false);
  const [lunarResult, setLunarResult] = useState<LunarToSolarResult | null>(null);
  const [lunarError, setLunarError] = useState<string | null>(null);

  async function onConvertSolarToLunar() {
    setSolarError(null);
    setSolarResult(null);
    setSolarLoading(true);
    try {
      const res = await fetch(`/api/calendar/solar-to-lunar?date=${encodeURIComponent(solarDate)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "convert failed");
      setSolarResult(data as SolarToLunarResult);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "未知错误";
      setSolarError(msg);
    } finally {
      setSolarLoading(false);
    }
  }

  async function onConvertLunarToSolar() {
    setLunarError(null);
    setLunarResult(null);
    setLunarLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/lunar-to-solar?year=${encodeURIComponent(lunarYear)}&month=${encodeURIComponent(lunarMonth)}&day=${encodeURIComponent(lunarDay)}&leap=${encodeURIComponent(
          String(lunarLeap)
        )}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "convert failed");
      setLunarResult(data as LunarToSolarResult);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "未知错误";
      setLunarError(msg);
    } finally {
      setLunarLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={[
            "px-4 py-2 rounded border",
            tab === "solarToLunar" ? "bg-sky-50 border-sky-200 text-sky-800" : "bg-white border-slate-200",
          ].join(" ")}
          onClick={() => setTab("solarToLunar")}
        >
          阳历 到 阴历
        </button>
        <button
          type="button"
          className={[
            "px-4 py-2 rounded border",
            tab === "lunarToSolar" ? "bg-sky-50 border-sky-200 text-sky-800" : "bg-white border-slate-200",
          ].join(" ")}
          onClick={() => setTab("lunarToSolar")}
        >
          阴历 到 阳历
        </button>
      </div>

      {tab === "solarToLunar" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg bg-white p-4">
            <div className="font-semibold mb-2">输入阳历日期</div>
            <label className="text-sm text-slate-700">
              日期（YYYY-MM-DD）
              <input
                className="ml-3 border rounded px-3 py-2 w-[220px] block mt-2"
                value={solarDate}
                onChange={(e) => setSolarDate(e.target.value)}
              />
            </label>
            <div className="mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-sky-500 text-white hover:bg-sky-600"
                onClick={onConvertSolarToLunar}
                disabled={solarLoading}
              >
                {solarLoading ? "转换中..." : "转换"}
              </button>
            </div>
            {solarError ? <div className="mt-3 text-red-600 text-sm">{solarError}</div> : null}
          </div>

          <div className="border rounded-lg bg-white p-4">
            <div className="font-semibold mb-2">结果</div>
            {solarResult ? (
              <div className="space-y-2 text-sm">
                <div>
                  阳历：<span className="font-medium">{solarResult.solarDate}</span>
                </div>
                <div>
                  周几：<span className="font-medium">{solarResult.weekday}</span>
                </div>
                <div>
                  阴历：{" "}
                  <span className="font-medium">
                    {solarResult.lunar.year}年{solarResult.lunar.leap ? "闰" : ""}
                    {solarResult.lunar.month}月{solarResult.lunar.day}日
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm">点击“转换”查看结果</div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg bg-white p-4">
            <div className="font-semibold mb-2">输入阴历日期</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                年
                <input
                  className="ml-3 border rounded px-3 py-2 w-full block mt-2"
                  type="number"
                  value={lunarYear}
                  onChange={(e) => setLunarYear(Number(e.target.value))}
                />
              </label>
              <label className="text-sm">
                月
                <input
                  className="ml-3 border rounded px-3 py-2 w-full block mt-2"
                  type="number"
                  min={1}
                  max={12}
                  value={lunarMonth}
                  onChange={(e) => setLunarMonth(Number(e.target.value))}
                />
              </label>
              <label className="text-sm">
                日
                <input
                  className="ml-3 border rounded px-3 py-2 w-full block mt-2"
                  type="number"
                  min={1}
                  max={31}
                  value={lunarDay}
                  onChange={(e) => setLunarDay(Number(e.target.value))}
                />
              </label>
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={lunarLeap} onChange={(e) => setLunarLeap(e.target.checked)} />
                闰月
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-sky-500 text-white hover:bg-sky-600"
                onClick={onConvertLunarToSolar}
                disabled={lunarLoading}
              >
                {lunarLoading ? "转换中..." : "转换"}
              </button>
            </div>
            {lunarError ? <div className="mt-3 text-red-600 text-sm">{lunarError}</div> : null}
          </div>

          <div className="border rounded-lg bg-white p-4">
            <div className="font-semibold mb-2">结果</div>
            {lunarResult ? (
              <div className="space-y-2 text-sm">
                <div>
                  阴历：{" "}
                  <span className="font-medium">
                    {lunarResult.lunar.year}年{lunarResult.lunar.leap ? "闰" : ""}
                    {lunarResult.lunar.month}月{lunarResult.lunar.day}日
                  </span>
                </div>
                <div>
                  周几：<span className="font-medium">{lunarResult.weekday}</span>
                </div>
                <div>
                  阳历：<span className="font-medium">{lunarResult.solarDate}</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm">点击“转换”查看结果</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanGeneratorPanel() {
  // 用户可配置的计划区间：开始日期 + 持续天数
  const [startDateInput, setStartDateInput] = useState<string>(dayjs().add(1, "day").format("YYYY-MM-DD"));
  const [horizonDays, setHorizonDays] = useState<number>(5);
  const startDate = useMemo(() => startDateInput, [startDateInput]);
  const endDate = useMemo(() => {
    const n = Math.max(1, Math.floor(Number(horizonDays) || 1));
    return dayjs(`${startDateInput}T00:00:00`).add(n - 1, "day").format("YYYY-MM-DD");
  }, [startDateInput, horizonDays]);

  // 这些值不再让用户输入：用于保持现有规则引擎排程可工作
  const weeklyHours = 10;
  const milestoneCount = 3;

  const [goal, setGoal] = useState<string>("我要完成一个万能日历生成器，并自动把大目标排到每天执行。");
  const [avoidWeekends, setAvoidWeekends] = useState<boolean>(true);
  // 不再使用传统节日过滤（避免节日识别不稳定）
  const avoidHolidays = false;

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(startDate);
  const [monthToShow, setMonthToShow] = useState<string>(dayjs(startDate).format("YYYY-MM-01"));

  // 当用户改变开始日期时，同步选中日期与日历月份（避免仍停留在旧月份）
  useEffect(() => {
    setSelectedDate(startDate);
    setMonthToShow(dayjs(startDate).format("YYYY-MM-01"));
  }, [startDate]);

  const tasksForSelectedDate = useMemo(() => {
    if (!plan) return [];
    return plan.items.filter((it) => it.date === selectedDate).sort((a, b) => a.type.localeCompare(b.type));
  }, [plan, selectedDate]);

  // 计划生成后只读展示：不提供新增/编辑/删除任务

  async function onGenerate() {
    setError(null);
    setLoading(true);
    setPlan(null);
    try {
      const body: GoalSpec = {
        description: goal,
        startDate,
        endDate,
        weeklyHours,
        avoidWeekends,
        avoidHolidays,
        milestoneCount,
      };
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "generate failed");
      const pr = data as PlanResult;
      setPlan(pr);
      const firstDate = pr.items.length ? pr.items[0].date : startDate;
      setSelectedDate(firstDate);
      setMonthToShow(dayjs(firstDate).format("YYYY-MM-01"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "未知错误";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold mb-2">目标输入</div>
          </div>
          <div className="text-xs text-slate-500 whitespace-nowrap">
            <div>开始：{startDate}</div>
            <div>截止：{endDate}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          <label className="text-sm">
            目标描述
            <textarea
              className="mt-2 w-full border rounded px-3 py-2 min-h-[110px]"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm flex items-center justify-between gap-3">
              <span className="text-slate-700">开始日期</span>
              <input
                type="date"
                className="w-[170px] border rounded px-3 py-2"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
              />
            </label>

            <label className="text-sm flex items-center justify-between gap-3">
              <span className="text-slate-700">持续天数</span>
              <input
                type="number"
                className="w-[170px] border rounded px-3 py-2"
                min={1}
                max={365}
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={avoidWeekends} onChange={(e) => setAvoidWeekends(e.target.checked)} />
                避开周末
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="px-5 py-2 rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
            onClick={onGenerate}
            disabled={loading}
          >
            {loading ? "生成中..." : "生成落地计划"}
          </button>
          {error ? <div className="text-red-600 text-sm">{error}</div> : null}
        </div>
      </div>

      {plan ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">
                计划日历：{dayjs(monthToShow).format("YYYY年M月")}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-sm border rounded px-3 py-1 hover:bg-slate-50"
                  onClick={() => setMonthToShow(dayjs(monthToShow).subtract(1, "month").format("YYYY-MM-01"))}
                >
                  上个月
                </button>
                <button
                  type="button"
                  className="text-sm border rounded px-3 py-1 hover:bg-slate-50"
                  onClick={() => setMonthToShow(dayjs(monthToShow).add(1, "month").format("YYYY-MM-01"))}
                >
                  下个月
                </button>
              </div>
            </div>

            <CalendarGrid
              monthDate={monthToShow}
              items={plan.items}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          <div>
            <div className="border rounded-lg bg-white p-4">
              <div className="font-semibold mb-1">选中日期：{selectedDate}</div>
              <div className="text-xs text-slate-500 mb-3">
                {plan.diagnostics.feasible ? (
                  <span className="text-emerald-700 font-medium">可行排期</span>
                ) : (
                  <span className="text-amber-700 font-medium">不可行排期</span>
                )}
              </div>

              {!plan.diagnostics.feasible ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-3">
                  缺口小时数：{plan.diagnostics.missingHours ?? "-"}。建议：提高每周投入、延长时间范围或减少里程碑/范围。
                </div>
              ) : null}

              <div className="font-semibold mt-2 mb-2">当天任务</div>
              {tasksForSelectedDate.length ? (
                <div className="space-y-2">
                  {tasksForSelectedDate.map((it) => (
                    <div key={it.id} className="border rounded p-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{it.title}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          类型：{it.type} / {it.durationHours}h
                        </div>
                        {it.notes ? (
                          <div className="text-xs text-slate-600 mt-2 whitespace-pre-line leading-relaxed">{it.notes}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">该天无任务（如果你勾选了“避开周末”，任务会集中在可用日期）。</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg bg-white p-4 text-sm text-slate-600">
          点击上方“生成落地计划”开始创建你的排期，并在日历格子上查看每天的任务分布。
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<TabKey>("conversion");

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <header className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">万能日历生成器</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={[
                "px-4 py-2 rounded border text-sm",
                tab === "conversion" ? "bg-white border-sky-200 text-sky-800" : "bg-white border-slate-200 text-slate-700",
              ].join(" ")}
              onClick={() => setTab("conversion")}
            >
              日历转换
            </button>
            <button
              type="button"
              className={[
                "px-4 py-2 rounded border text-sm",
                tab === "plan" ? "bg-white border-sky-200 text-sky-800" : "bg-white border-slate-200 text-slate-700",
              ].join(" ")}
              onClick={() => setTab("plan")}
            >
              计划页
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-10">
        <div className="bg-white border rounded-lg p-4">
          {tab === "conversion" ? <ConversionPanel /> : <PlanGeneratorPanel />}
        </div>
      </main>
    </div>
  );
}

