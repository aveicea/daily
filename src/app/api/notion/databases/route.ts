import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token?.trim()) {
      return NextResponse.json({ error: "토큰을 입력해주세요" }, { status: 400 });
    }

    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: { value: "database", property: "object" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.message ?? "Notion API 오류가 발생했습니다";
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const databases = (data.results ?? []).map(
      (db: { id: string; title: Array<{ plain_text: string }> }) => ({
        id: db.id,
        title:
          db.title?.map((t) => t.plain_text).join("") || "제목 없음",
      })
    );

    return NextResponse.json({ databases });
  } catch {
    return NextResponse.json(
      { error: "요청 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
