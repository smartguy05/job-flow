import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSettings } from "@/lib/settings";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const s = await getSettings(user.id);
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenaiKey = !!process.env.OPENAI_API_KEY;
  const keyReadyForProvider = s.provider === "openai" ? hasOpenaiKey : hasAnthropicKey;
  return NextResponse.json({ ...s, hasAnthropicKey, hasOpenaiKey, keyReadyForProvider });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  await setSettings(user.id, body);
  return NextResponse.json({ ok: true });
}
