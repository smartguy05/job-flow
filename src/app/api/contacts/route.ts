import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { listContacts, createContact } from "@/lib/services/contacts";
import { errorResponse } from "@/lib/services/errors";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(await listContacts(user.id));
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await createContact(user.id, await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
