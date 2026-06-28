import { NextRequest, NextResponse } from "next/server";

const N_VER = "2022-06-28";
const hdrs = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Notion-Version": N_VER,
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token      = searchParams.get("token") ?? "";
  const databaseId = searchParams.get("databaseId") ?? "";
  const date       = searchParams.get("date") ?? "";
  const dateProp   = searchParams.get("dateProp") ?? "Date";

  if (!token || !databaseId || !date) {
    return NextResponse.json({ error: "token, databaseId, date required" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: hdrs(token),
      body: JSON.stringify({
        filter: { property: dateProp, date: { equals: date } },
        page_size: 50,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: res.status });
    return NextResponse.json({ pages: data.results });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
