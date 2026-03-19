import { NextResponse } from "next/server";
import { z } from "zod";
import { solarToLunar } from "@/lib/calendar";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    date: url.searchParams.get("date"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = solarToLunar(parsed.data.date);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: "Failed to convert solar->lunar", details: String(e) }, { status: 500 });
  }
}

