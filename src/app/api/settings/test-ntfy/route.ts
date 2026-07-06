import { NextRequest, NextResponse } from "next/server";
import { sendNtfy } from "@/lib/ntfy";
import { getUser, unauthorized } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const ok = await sendNtfy(user.id, {
    title: "JobFlow test",
    message: "Push notifications are working.",
    tags: ["white_check_mark"],
  });
  return NextResponse.json({ ok });
}
