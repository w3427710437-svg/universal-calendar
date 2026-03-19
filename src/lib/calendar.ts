import { Lunar, Solar } from "lunar-javascript";

export type LunarDate = {
  year: number;
  month: number; // 1-12（闰月：month 仍为正数）
  day: number; // 1-30
  leap: boolean;
};

export type SolarToLunarResult = {
  solarDate: string; // YYYY-MM-DD
  lunar: LunarDate;
  festivals: string[];
  weekday: string; // 例如“星期四”
};

export type LunarToSolarResult = {
  lunar: LunarDate;
  solarDate: string; // YYYY-MM-DD
  festivals: string[];
  weekday: string;
};

function parseYmd(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error("Invalid date format, expected YYYY-MM-DD");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // 严格校验日期是否真实存在（避免 2026-02-30 这类被 JS/库自动进位）
  // 用 UTC 构造避免本地时区导致跨日。
  const dt = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day;
  if (!isValid) throw new Error("Invalid date value");
  return { year, month, day };
}

export function solarToLunar(date: string): SolarToLunarResult {
  const { year, month, day } = parseYmd(date);
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();

  const lunarMonthSigned = Number(lunar.getMonth?.());
  const leap = typeof lunar.isLeap === "function" ? !!lunar.isLeap() : lunarMonthSigned < 0;

  const lunarDate: LunarDate = {
    year: Number(lunar.getYear?.()),
    month: Math.abs(lunarMonthSigned),
    day: Number(lunar.getDay?.()),
    leap,
  };

  // lunar-javascript 提供的“传统节日/节庆”（具体命名以库返回为准）
  const festivals = (solar.getFestivals?.() ?? []) as string[];
  const weekday = (typeof solar.getWeekInChinese === "function"
    ? solar.getWeekInChinese()
    : solar.getWeek?.()) as string;

  return {
    solarDate: solar.toYmd?.() ?? date,
    lunar: lunarDate,
    festivals,
    weekday: String(weekday),
  };
}

export function lunarToSolar(input: {
  year: number;
  month: number;
  day: number;
  leap: boolean;
}): LunarToSolarResult {
  const { year, month, day, leap } = input;
  const lunarMonthSigned = leap ? -Math.abs(month) : Math.abs(month);
  const lunar = Lunar.fromYmd(year, lunarMonthSigned, day);
  const solar = lunar.getSolar();

  const lunarDate: LunarDate = {
    year: Number(lunar.getYear?.()),
    month: Math.abs(Number(lunar.getMonth?.())),
    day: Number(lunar.getDay?.()),
    leap: typeof lunar.isLeap === "function" ? !!lunar.isLeap() : lunarMonthSigned < 0,
  };

  const festivals = (solar.getFestivals?.() ?? []) as string[];
  const weekday = (typeof solar.getWeekInChinese === "function"
    ? solar.getWeekInChinese()
    : solar.getWeek?.()) as string;

  return {
    lunar: lunarDate,
    solarDate: solar.toYmd?.() ?? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    festivals,
    weekday: String(weekday),
  };
}

export function isTraditionalFestival(date: string): boolean {
  const { festivals } = solarToLunar(date);
  return festivals.length > 0;
}

