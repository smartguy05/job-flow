import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { generateDraft } from "@/lib/llm";
import { logEvent } from "@/lib/events";
import { NotFoundError, ValidationError } from "./errors";

export const DRAFT_TYPES = ["reply", "cover_letter", "follow_up"] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

// Generate a cover letter / recruiter reply / follow-up for one of the user's applications,
// store it, and log a `note` event. The linked contact supplies the recruiter's name.
export async function createDraft(
  userId: string,
  applicationId: number,
  input: { type?: DraftType; extra?: string },
): Promise<{ id: number; content: string; type: DraftType }> {
  const type = input.type ?? "reply";
  if (!DRAFT_TYPES.includes(type)) throw new ValidationError(`type must be one of ${DRAFT_TYPES.join(", ")}`);

  const [app] = Number.isFinite(applicationId)
    ? await db
        .select()
        .from(schema.applications)
        .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)))
        .limit(1)
    : [];
  if (!app) throw new NotFoundError();
  const contact = app.contactId
    ? (
        await db
          .select({ name: schema.contacts.name })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.id, app.contactId), eq(schema.contacts.userId, userId)))
          .limit(1)
      )[0]
    : null;

  const content = await generateDraft({
    userId,
    type,
    job: { company: app.company, roleTitle: app.roleTitle, jdSnapshot: app.jdSnapshot || "" },
    contactName: contact?.name,
    extra: input.extra,
  });

  const [row] = await db
    .insert(schema.messageDrafts)
    .values({ userId, applicationId, type, content })
    .returning({ id: schema.messageDrafts.id });
  await logEvent(userId, applicationId, "note", `Generated ${type} draft`);
  return { id: row.id, content, type };
}
