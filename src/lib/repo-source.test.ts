import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseGithubRepo, fetchRepoContext, RepoSourceError } from "./repo-source";

describe("parseGithubRepo", () => {
  it("accepts github.com repo URLs in common shapes", () => {
    expect(parseGithubRepo("https://github.com/me/limiter")).toEqual({ owner: "me", repo: "limiter" });
    expect(parseGithubRepo("github.com/me/limiter.git")).toEqual({ owner: "me", repo: "limiter" });
    expect(parseGithubRepo("https://www.github.com/me/limiter/tree/main/src")).toEqual({ owner: "me", repo: "limiter" });
  });
  it("rejects other hosts and non-repo paths", () => {
    expect(parseGithubRepo("https://gitlab.com/me/limiter")).toBeNull();
    expect(parseGithubRepo("https://github.com.evil.io/me/x")).toBeNull();
    expect(parseGithubRepo("https://github.com/me")).toBeNull();
    expect(parseGithubRepo("http://169.254.169.254/latest")).toBeNull();
    expect(parseGithubRepo("not a url")).toBeNull();
  });
});

describe("fetchRepoContext", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("combines repo metadata and README into a context block", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            full_name: "me/limiter",
            html_url: "https://github.com/me/limiter",
            description: "Token bucket",
            created_at: "2019-04-02T00:00:00Z",
            pushed_at: "2021-01-01T00:00:00Z",
            language: "Go",
            topics: ["rate-limiting"],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("# Limiter\n" + "x".repeat(20000)));
    const r = await fetchRepoContext("https://github.com/me/limiter");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/me/limiter");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.github.com/repos/me/limiter/readme");
    expect(r.identifier).toBe("https://github.com/me/limiter");
    expect(r.text).toContain("Description: Token bucket");
    expect(r.text).toContain("Created: 2019-04-02");
    expect(r.text).toContain("Primary language: Go");
    expect(r.text).toContain("Topics: rate-limiting");
    expect(r.text).toContain("# Limiter");
    expect(r.text.length).toBeLessThan(13000);
  });

  it("works without a README", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: "me/x", html_url: "https://github.com/me/x" })))
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    const r = await fetchRepoContext("https://github.com/me/x");
    expect(r.text).toContain("me/x");
    expect(r.text).not.toContain("README");
  });

  it("explains unsupported hosts and missing/private repos", async () => {
    await expect(fetchRepoContext("https://gitlab.com/me/x")).rejects.toThrow(RepoSourceError);
    await expect(fetchRepoContext("https://gitlab.com/me/x")).rejects.toThrow(/paste/i);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expect(fetchRepoContext("https://github.com/me/private")).rejects.toThrow(/private|not found/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
