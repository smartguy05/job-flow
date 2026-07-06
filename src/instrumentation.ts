// Runs once when the Next.js server boots (Node runtime only). Applies DB migrations at
// startup so the schema is ready before the first request. Retries briefly to tolerate
// Postgres still coming up alongside the app container.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_DB_MIGRATE === "1") return;

  const { runMigrations } = await import("@/db");
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await runMigrations();
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`[startup] migration attempt ${attempt} failed; retrying…`, (e as Error).message);
      await delay(2000);
    }
  }
  console.error("[startup] migrations failed after retries", lastErr);
  throw lastErr;
}
