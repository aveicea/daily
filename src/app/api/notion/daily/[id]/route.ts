import { NextRequest, NextResponse } from "next/server";

const N_VER = "2022-06-28";
const hdrs = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Notion-Version": N_VER,
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { token, properties } = await req.json();

  if (!token || !properties) {
    return NextResponse.json({ error: "token and properties required" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: hdrs(token),
      body: JSON.stringify({ properties }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: res.status });
    return NextResponse.json({ ok: true, page: data });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
