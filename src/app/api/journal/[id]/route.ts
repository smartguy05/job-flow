import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { updateJournalEntry, deleteJournalEntry } from "@/lib/services/journal";
import { errorResponse } from "@/lib/services/errors";

type Ctx = { params: Promise<{ id: string }> };

// Editing an entry clears syncedAt so the change is offered in the next profile sync.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  try {
    await updateJournalEntry(user.id, id, await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const id = parseInt((await ctx.params).id, 10);
  try {
    await deleteJournalEntry(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
