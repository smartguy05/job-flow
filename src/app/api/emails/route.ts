import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { listRecentEmails } from "@/lib/services/emails";

// Recent email activity (messages ingested over MCP), newest first.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 10);
  return NextResponse.json(await listRecentEmails(user.id, limit));
}
