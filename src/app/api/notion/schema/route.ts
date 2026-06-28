import { NextRequest, NextResponse } from "next/server";

type SelectOption = { id: string; name: string; color: string };
type StatusGroup = { id: string; name: string; color: string; option_ids: string[] };

interface RawProp {
  type: string;
  select?: { options: SelectOption[] };
  multi_select?: { options: SelectOption[] };
  status?: { options: SelectOption[]; groups: StatusGroup[] };
}

export interface SchemaProp {
  name: string;
  type: string;
  options?: SelectOption[];
  groups?: StatusGroup[];
}

export async function POST(req: NextRequest) {
  try {
    const { token, databaseId } = await req.json();
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: res.status });

    const raw = data.properties as Record<string, RawProp>;

    const properties: SchemaProp[] = Object.entries(raw).map(([name, v]) => {
      const p: SchemaProp = { name, type: v.type };
      if (v.type === "select")       p.options = v.select?.options ?? [];
      if (v.type === "multi_select") p.options = v.multi_select?.options ?? [];
      if (v.type === "status") {
        p.options = v.status?.options ?? [];
        p.groups  = v.status?.groups  ?? [];
      }
      return p;
    });

    const dates = properties.filter(p => p.type === "date").map(p => p.name);
    const suggestedDateProp = dates.find(k => /날짜|date/i.test(k)) ?? dates[0] ?? null;

    return NextResponse.json({ properties, suggestedDateProp });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
