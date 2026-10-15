import { db, schema } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { ValidationError } from "./errors";

export type ContactInput = {
  name?: string;
  agency?: string | null;
  email?: string | null;
  linkedin?: string | null;
  notes?: string | null;
};

// The user's contacts, newest first.
export async function listContacts(userId: string) {
  return db
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, userId))
    .orderBy(desc(schema.contacts.createdAt));
}

export async function createContact(userId: string, input: ContactInput): Promise<{ id: number }> {
  if (!input.name) throw new ValidationError("name required");
  const [row] = await db
    .insert(schema.contacts)
    .values({
      userId,
      name: input.name,
      agency: input.agency ?? null,
      email: input.email ?? null,
      linkedin: input.linkedin ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: schema.contacts.id });
  return { id: row.id };
}

// Find one of the user's contacts by email (trimmed, case-insensitive). Null when absent.
export async function findContactByEmail(userId: string, email: string) {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  const [row] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.userId, userId), eq(sql`lower(trim(${schema.contacts.email}))`, needle)))
    .orderBy(desc(schema.contacts.createdAt))
    .limit(1);
  return row ?? null;
}
