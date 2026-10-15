import { describe, it, expect } from "vitest";
import { seedUser } from "@/test/req";
import { ValidationError } from "./errors";
import { listContacts, createContact, findContactByEmail } from "./contacts";

const uid = () => globalThis.__testUserId;

describe("contacts service", () => {
  it("requires a name", async () => {
    await expect(createContact(uid(), {})).rejects.toBeInstanceOf(ValidationError);
    await expect(createContact(uid(), { name: "" })).rejects.toThrow("name required");
  });

  it("creates, lists and finds by email case-insensitively, scoped to the user", async () => {
    const other = await seedUser("contacts-svc-other");
    const { id } = await createContact(uid(), { name: "Rita", email: "Rita@Agency.test", agency: "Agency" });
    await createContact(other.id, { name: "Other Rita", email: "rita@agency.test" });

    const mine = await listContacts(uid());
    expect(mine.map((c) => c.id)).toContain(id);
    expect(mine.some((c) => c.name === "Other Rita")).toBe(false);

    expect((await findContactByEmail(uid(), " rita@AGENCY.test "))?.id).toBe(id);
    expect((await findContactByEmail(other.id, "rita@agency.test"))?.name).toBe("Other Rita");
    expect(await findContactByEmail(uid(), "nobody@x.test")).toBeNull();
    expect(await findContactByEmail(uid(), "  ")).toBeNull();
  });
});
