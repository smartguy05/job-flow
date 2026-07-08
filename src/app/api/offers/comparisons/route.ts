import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray, desc } from "drizzle-orm";
import { generateOfferComparison } from "@/lib/llm";
import { buildOfferTable, type ComparableApp } from "@/lib/offer-comparison";
import type { LlmDocument } from "@/lib/llm-provider";
import { logEvent } from "@/lib/events";
import { getUser, unauthorized } from "@/lib/auth";

export const maxDuration = 120;

// Columns the comparison reads from an application, mapped to ComparableApp.
function toComparable(a: typeof schema.applications.$inferSelect): ComparableApp {
  return {
    id: a.id,
    company: a.company,
    roleTitle: a.roleTitle,
    payMin: a.payMin,
    payMax: a.payMax,
    payCurrency: a.payCurrency,
    payPeriod: a.payPeriod,
    bonus: a.bonus,
    benefits: a.benefits,
    locationMode: a.locationMode,
    location: a.location,
    employmentType: a.employmentType,
    seniorityLevel: a.seniorityLevel,
    techStack: a.techStack,
    companySize: a.companySize,
    companyStage: a.companyStage,
    industry: a.industry,
    interestRating: a.interestRating,
    pros: a.pros,
    cons: a.cons,
  };
}

// List saved comparisons (metadata only; the full snapshot is fetched per-comparison).
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const rows = await db
    .select({
      id: schema.offerComparisons.id,
      title: schema.offerComparisons.title,
      applicationIds: schema.offerComparisons.applicationIds,
      priorities: schema.offerComparisons.priorities,
      createdAt: schema.offerComparisons.createdAt,
      updatedAt: schema.offerComparisons.updatedAt,
    })
    .from(schema.offerComparisons)
    .where(eq(schema.offerComparisons.userId, user.id))
    .orderBy(desc(schema.offerComparisons.createdAt));
  return NextResponse.json(
    rows.map((r) => ({ ...r, applicationIds: JSON.parse(r.applicationIds) as number[] })),
  );
}

// Generate and save an offer comparison across 2+ of the user's applications.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  try {
    const body = await req.json();
    const requestedIds: number[] = Array.isArray(body.applicationIds)
      ? body.applicationIds.filter((n: unknown) => Number.isInteger(n))
      : [];
    if (requestedIds.length < 2)
      return NextResponse.json({ error: "Select at least two applications" }, { status: 400 });

    // Only the user's own applications; preserve the requested order.
    const owned = await db
      .select()
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, user.id), inArray(schema.applications.id, requestedIds)));
    const ordered = requestedIds
      .map((id) => owned.find((a) => a.id === id))
      .filter((a): a is typeof schema.applications.$inferSelect => !!a);
    if (ordered.length < 2)
      return NextResponse.json({ error: "Select at least two of your applications" }, { status: 400 });

    const apps = ordered.map(toComparable);
    const appIds = ordered.map((a) => a.id);

    // Benefits PDFs attached to any included application, as native document blocks.
    const files = await db
      .select({
        name: schema.applicationFiles.name,
        mimeType: schema.applicationFiles.mimeType,
        data: schema.applicationFiles.data,
      })
      .from(schema.applicationFiles)
      .where(
        and(
          eq(schema.applicationFiles.userId, user.id),
          inArray(schema.applicationFiles.applicationId, appIds),
        ),
      );
    const benefitsDocs: LlmDocument[] = files
      .filter((f) => f.mimeType === "application/pdf")
      .map((f) => ({ name: f.name, mediaType: "application/pdf", data: f.data.toString("base64") }));

    const priorities: string | null =
      typeof body.priorities === "string" && body.priorities.trim() ? body.priorities.trim() : null;

    const table = buildOfferTable(apps);
    const verdict = await generateOfferComparison({ userId: user.id, applications: apps, priorities, benefitsDocs });

    const title: string =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : ordered.map((a) => a.company).join(" vs ");
    const resultJson = JSON.stringify({ table, verdict });

    const [row] = await db
      .insert(schema.offerComparisons)
      .values({ userId: user.id, title, applicationIds: JSON.stringify(appIds), priorities, resultJson })
      .returning({ id: schema.offerComparisons.id });

    for (const id of appIds) await logEvent(user.id, id, "offer_comparison", title);

    return NextResponse.json({ id: row.id, title, applicationIds: appIds, priorities, result: { table, verdict } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
