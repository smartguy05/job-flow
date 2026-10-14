import { NextRequest, NextResponse } from "next/server";
import { getUser, unauthorized } from "@/lib/auth";
import { draftInvention } from "@/lib/llm";
import { fetchRepoContext, RepoSourceError } from "@/lib/repo-source";

export const maxDuration = 120;

// Draft one Exhibit A entry for review (nothing saved). Body: { text } (the user's own
// description, or a pasted README) or { url } (a public github.com repo).
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();
  const { text, url } = await req.json();
  if (!text?.trim() && !url?.trim()) return NextResponse.json({ error: "text or url required" }, { status: 400 });
  try {
    let source = text?.trim() ?? "";
    let identifier: string | null = null;
    if (url?.trim()) {
      const repo = await fetchRepoContext(url);
      identifier = repo.identifier;
      source = [repo.text, source].filter(Boolean).join("\n\nUser notes:\n");
    }
    const draft = await draftInvention({ userId: user.id, text: source });
    return NextResponse.json({ draft: { ...draft, identifier: draft.identifier ?? identifier } });
  } catch (e) {
    const status = e instanceof RepoSourceError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
