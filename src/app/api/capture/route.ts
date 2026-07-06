import { NextRequest, NextResponse } from "next/server";
import { extractJob } from "@/lib/llm";
import { findDuplicates } from "@/lib/dedup";
import { getSettings } from "@/lib/settings";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Extract structured fields from pasted text/link and check for duplicates.
// Does NOT persist anything — the UI reviews, then POSTs to /api/applications.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const text: string = body.text || "";
    if (!text.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const extracted = await extractJob({
      userId: user.id,
      text,
      companyHint: body.companyHint,
      contactHint: body.contactHint,
    });

    const settings = await getSettings(user.id);
    const duplicates =
      extracted.company && extracted.roleTitle
        ? await findDuplicates(user.id, extracted.company, extracted.roleTitle, settings.dedupWindowDays)
        : [];

    return NextResponse.json({ extracted, duplicates, dedupWindowDays: settings.dedupWindowDays });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
