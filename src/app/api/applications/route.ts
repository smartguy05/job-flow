import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { listApplications, createApplication } from "@/lib/services/applications";
import { errorResponse } from "@/lib/services/errors";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(await listApplications(user.id));
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await createApplication(user.id, await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
