import { db, schema } from "@/db";

// Provision-on-login: create the user row on first sight of an OIDC subject, or refresh
// their profile fields on subsequent logins. Returns the internal users.id.
export async function upsertUserBySub(input: {
  sub: string;
  email?: string;
  name?: string;
}): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({ sub: input.sub, email: input.email ?? null, name: input.name ?? null })
    .onConflictDoUpdate({
      target: schema.users.sub,
      set: { email: input.email ?? null, name: input.name ?? null, updatedAt: new Date() },
    })
    .returning({ id: schema.users.id });
  return row.id;
}
