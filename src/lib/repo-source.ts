// Fetch public GitHub repo context (metadata + README) to draft an Exhibit A entry from a
// link. Deliberately limited to github.com repo URLs → api.github.com, so a multi-user
// server never fetches arbitrary user-supplied hosts (SSRF). Anything else: paste text.

export class RepoSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoSourceError";
  }
}

const README_LIMIT = 12000;
const NAME = /^[A-Za-z0-9_.-]+$/;

export function parseGithubRepo(raw: string): { owner: string; repo: string } | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
  const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
  const repo = repoRaw?.replace(/\.git$/, "");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;
  return { owner, repo };
}

type RepoMeta = {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  created_at?: string;
  pushed_at?: string;
  language?: string | null;
  topics?: string[];
  license?: { name?: string } | null;
};

export async function fetchRepoContext(url: string): Promise<{ identifier: string; text: string }> {
  const parsed = parseGithubRepo(url);
  if (!parsed) {
    throw new RepoSourceError("Only public github.com repository links are supported — paste the README or a description instead.");
  }
  const api = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const headers = { "User-Agent": "JobFlow", Accept: "application/vnd.github+json" };
  const res = await fetch(api, { headers });
  if (!res.ok) {
    throw new RepoSourceError(
      res.status === 404
        ? "Repository not found (it may be private) — paste the README or a description instead."
        : `GitHub returned ${res.status} — paste the README or a description instead.`,
    );
  }
  const meta = (await res.json()) as RepoMeta;
  const readmeRes = await fetch(`${api}/readme`, { headers: { ...headers, Accept: "application/vnd.github.raw" } });
  const readme = readmeRes.ok ? (await readmeRes.text()).slice(0, README_LIMIT) : "";

  const identifier = meta.html_url ?? `https://github.com/${parsed.owner}/${parsed.repo}`;
  const lines = [`Repository: ${meta.full_name ?? `${parsed.owner}/${parsed.repo}`} (${identifier})`];
  if (meta.description) lines.push(`Description: ${meta.description}`);
  if (meta.created_at) lines.push(`Created: ${meta.created_at.slice(0, 10)}`);
  if (meta.pushed_at) lines.push(`Last pushed: ${meta.pushed_at.slice(0, 10)}`);
  if (meta.language) lines.push(`Primary language: ${meta.language}`);
  if (meta.topics?.length) lines.push(`Topics: ${meta.topics.join(", ")}`);
  if (meta.license?.name) lines.push(`License: ${meta.license.name}`);
  if (readme.trim()) lines.push("", "README:", readme);
  return { identifier, text: lines.join("\n") };
}
