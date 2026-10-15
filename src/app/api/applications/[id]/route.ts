import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { getApplicationDetail, updateApplication, deleteApplication } from "@/lib/services/applications";
import { errorResponse } from "@/lib/services/errors";

type Ctx = { params: Promise<{ id: string }> };
const getId = async (ctx: Ctx) => parseInt((await ctx.params).id, 10);

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await getApplicationDetail(user.id, await getId(ctx)));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const id = await getId(ctx);
    await updateApplication(user.id, id, await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    await deleteApplication(user.id, await getId(ctx));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
