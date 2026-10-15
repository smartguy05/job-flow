import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getOwnedJob } from "@/lib/jobs";
import { DOCX_MIME, validateJobUpload } from "@/lib/job-files";
import { NotFoundError, ValidationError } from "./errors";

// Job documents (store-and-download only, never sent to an LLM). Every query is scoped by
// userId AND the owned jobId, so another user's (or another job's) file id reads as 404.

const META = {
  id: schema.jobFiles.id,
  kind: schema.jobFiles.kind,
  name: schema.jobFiles.name,
  mimeType: schema.jobFiles.mimeType,
  size: schema.jobFiles.size,
  createdAt: schema.jobFiles.createdAt,
};
export type JobFileMeta = { id: number; kind: string; name: string; mimeType: string; size: number; createdAt: Date };

async function ownedJobId(userId: string, jobId: number): Promise<number> {
  const job = await getOwnedJob(userId, jobId);
  if (!job) throw new NotFoundError();
  return job.id;
}

const scope = (userId: string, jobId: number, fileId: number) =>
  and(eq(schema.jobFiles.id, fileId), eq(schema.jobFiles.jobId, jobId), eq(schema.jobFiles.userId, userId));

export async function listJobFiles(userId: string, jobId: number): Promise<JobFileMeta[]> {
  const id = await ownedJobId(userId, jobId);
  return db
    .select(META)
    .from(schema.jobFiles)
    .where(and(eq(schema.jobFiles.userId, userId), eq(schema.jobFiles.jobId, id)))
    .orderBy(desc(schema.jobFiles.createdAt), desc(schema.jobFiles.id));
}

export async function addJobFile(
  userId: string,
  jobId: number,
  f: { kind?: string | null; name: string; mimeType: string; data: Buffer },
): Promise<JobFileMeta> {
  const id = await ownedJobId(userId, jobId);
  const kind = f.kind || "misc";
  const error = validateJobUpload({ kind, mimeType: f.mimeType, size: f.data.length });
  if (error) throw new ValidationError(error);
  const [row] = await db
    .insert(schema.jobFiles)
    .values({
      userId,
      jobId: id,
      kind,
      name: f.name || (f.mimeType === DOCX_MIME ? "document.docx" : "document.pdf"),
      mimeType: f.mimeType,
      size: f.data.length,
      data: f.data,
    })
    .returning(META);
  return row;
}

export async function getJobFile(
  userId: string,
  jobId: number,
  fileId: number,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const id = await ownedJobId(userId, jobId);
  const [f] = await db
    .select({ name: schema.jobFiles.name, mimeType: schema.jobFiles.mimeType, data: schema.jobFiles.data })
    .from(schema.jobFiles)
    .where(scope(userId, id, fileId))
    .limit(1);
  if (!f) throw new NotFoundError();
  return f;
}

export async function deleteJobFile(userId: string, jobId: number, fileId: number): Promise<void> {
  const id = await ownedJobId(userId, jobId);
  const deleted = await db.delete(schema.jobFiles).where(scope(userId, id, fileId)).returning({ id: schema.jobFiles.id });
  if (deleted.length === 0) throw new NotFoundError();
}
