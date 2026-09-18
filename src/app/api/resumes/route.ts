import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getUser, unauthorized } from "@/lib/auth";

// List all of the current user's resumes across every application, newest first, with the
// owning application's company/role so the UI can offer them as reusable sources. Blobs are
// never projected here.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const rows = await db
    .select({
      id: schema.resumes.id,
      applicationId: schema.resumes.applicationId,
      version: schema.resumes.version,
      status: schema.resumes.status,
      pageCount: schema.resumes.pageCount,
      createdAt: schema.resumes.createdAt,
      company: schema.applications.company,
      roleTitle: schema.applications.roleTitle,
    })
    .from(schema.resumes)
    .innerJoin(schema.applications, eq(schema.resumes.applicationId, schema.applications.id))
    .where(eq(schema.resumes.userId, user.id))
    .orderBy(desc(schema.resumes.createdAt));
  return NextResponse.json(rows);
}
