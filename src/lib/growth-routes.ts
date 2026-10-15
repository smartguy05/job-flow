import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { errorResponse } from "@/lib/services/errors";
import { createItem, deleteItem, listItems, updateItem, type GrowthKind } from "@/lib/services/career-growth";

// Route handlers shared by /api/jobs/[id]/{people,one-on-ones,reviews,goals} and their
// [subId] routes. Each route file just picks its kind; auth, tenant scoping and error
// mapping live here and in the service.

type JobCtx = { params: Promise<{ id: string }> };
type SubCtx = { params: Promise<{ id: string; subId: string }> };

const int = (s: string) => parseInt(s, 10);

export function collectionRoutes(kind: GrowthKind) {
  return {
    async GET(req: NextRequest, ctx: JobCtx) {
      const user = await getUser(req);
      if (!user) return unauthorized();
      try {
        return NextResponse.json(await listItems(kind, user.id, int((await ctx.params).id)));
      } catch (e) {
        return errorResponse(e);
      }
    },
    async POST(req: NextRequest, ctx: JobCtx) {
      const user = await getUser(req);
      if (!user) return unauthorized();
      try {
        const body = await req.json().catch(() => ({}));
        return NextResponse.json(await createItem(kind, user.id, int((await ctx.params).id), body));
      } catch (e) {
        return errorResponse(e);
      }
    },
  };
}

export function itemRoutes(kind: GrowthKind) {
  return {
    async PATCH(req: NextRequest, ctx: SubCtx) {
      const user = await getUser(req);
      if (!user) return unauthorized();
      try {
        const p = await ctx.params;
        await updateItem(kind, user.id, int(p.id), int(p.subId), await req.json().catch(() => ({})));
        return NextResponse.json({ ok: true });
      } catch (e) {
        return errorResponse(e);
      }
    },
    async DELETE(req: NextRequest, ctx: SubCtx) {
      const user = await getUser(req);
      if (!user) return unauthorized();
      try {
        const p = await ctx.params;
        await deleteItem(kind, user.id, int(p.id), int(p.subId));
        return NextResponse.json({ ok: true });
      } catch (e) {
        return errorResponse(e);
      }
    },
  };
}
