import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import { addJobFile, deleteJobFile, getJobFile, listJobFiles } from "./job-files";
import { PDF_MIME } from "@/lib/job-files";

const uid = () => globalThis.__testUserId;
async function makeJob(userId: string) {
  const [j] = await db
    .insert(schema.jobs)
    .values({ userId, company: "Files Co", companyNormalized: "files co", title: "Engineer" })
    .returning({ id: schema.jobs.id });
  return j.id;
}
const file = (over = {}) => ({ kind: "offer_letter", name: "offer.pdf", mimeType: PDF_MIME, data: Buffer.from([1, 2, 3]), ...over });

describe("job files service", () => {
  it("stores, lists (no bytes), downloads and deletes", async () => {
    const jobId = await makeJob(uid());
    const meta = await addJobFile(uid(), jobId, file());
    expect(meta).toMatchObject({ kind: "offer_letter", name: "offer.pdf", size: 3 });
    expect(meta).not.toHaveProperty("data");
    const list = await listJobFiles(uid(), jobId);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("data");
    const got = await getJobFile(uid(), jobId, meta.id);
    expect(got.data).toEqual(Buffer.from([1, 2, 3]));
    await deleteJobFile(uid(), jobId, meta.id);
    await expect(getJobFile(uid(), jobId, meta.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteJobFile(uid(), jobId, meta.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("defaults kind to misc and a blank name by type; rejects bad uploads", async () => {
    const jobId = await makeJob(uid());
    expect(await addJobFile(uid(), jobId, file({ kind: undefined, name: "" }))).toMatchObject({ kind: "misc", name: "document.pdf" });
    await expect(addJobFile(uid(), jobId, file({ mimeType: "image/png" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("isolates tenants and jobs", async () => {
    const jobId = await makeJob(uid());
    const { id } = await addJobFile(uid(), jobId, file());
    const other = await seedUser("job-files-svc-other");
    await expect(listJobFiles(other.id, jobId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addJobFile(other.id, jobId, file())).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJobFile(other.id, jobId, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteJobFile(other.id, jobId, id)).rejects.toBeInstanceOf(NotFoundError);
    const otherJob = await makeJob(uid());
    await expect(getJobFile(uid(), otherJob, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listJobFiles(uid(), jobId)).toHaveLength(1);
  });
});
