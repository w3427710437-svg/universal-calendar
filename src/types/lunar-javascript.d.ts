declare module "lunar-javascript" {
  // 该库本身以 JS 形式发布，TS 类型较少；在本项目中我们按“可用即可”的方式做最小声明。
  // 实际运行时以 lunar-javascript 的 API 为准。
  type SolarInstance = {
    getFestivals?: () => string[];
    getWeekInChinese?: () => string;
    getWeek?: () => string;
    toYmd?: () => string;
    getLunar: () => LunarInstance;
  };

  type LunarInstance = {
    getYear?: () => number | string;
    getMonth?: () => number | string;
    getDay?: () => number | string;
    isLeap?: () => boolean;
    getSolar: () => SolarInstance;
  };

  export const Solar: {
    fromYmd: (year: number, month: number, day: number) => SolarInstance;
  };

  export const Lunar: {
    fromYmd: (year: number, month: number, day: number) => LunarInstance;
  };
}

