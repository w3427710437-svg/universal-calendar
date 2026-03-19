import { NextResponse } from "next/server";
import { z } from "zod";
import { lunarToSolar } from "@/lib/calendar";

const QuerySchema = z.object({
  year: z.coerce.number().int().min(1).max(3000),
  month: z.coerce.number().int().min(1).max(12),
  day: z.coerce.number().int().min(1).max(31),
  // 注意：URL 查询参数里是字符串，`z.coerce.boolean()` 会把 `"false"` 当成 truthy => true，导致闰月取反。
  leap: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    year: url.searchParams.get("year"),
    month: url.searchParams.get("month"),
    day: url.searchParams.get("day"),
    leap: url.searchParams.get("leap"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = lunarToSolar(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to convert lunar->solar", details: String(e) },
      { status: 500 }
    );
  }
}

