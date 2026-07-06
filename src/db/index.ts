import path from "node:path";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

// Use an embedded in-process Postgres (pglite) for tests, real postgres.js otherwise.
// pglite gives each vitest file (isolate: true → own process) a fresh in-memory DB.
// Importing PGlite does not instantiate the wasm engine; only `new PGlite()` does.
const usePglite = process.env.NODE_ENV === "test" || process.env.USE_PGLITE === "1";

type PgliteDb = ReturnType<typeof drizzlePglite<typeof schema>>;
type PostgresDb = ReturnType<typeof drizzlePg<typeof schema>>;
// Both drivers expose the identical PgDatabase query-builder API; consumers see one type.
export type Db = PostgresDb;

declare global {
  // eslint-disable-next-line no-var
  var __db: Db | undefined;
}

function createDb(): Db {
  if (usePglite) {
    // Same query-builder surface as postgres-js; bridge the driver-specific result HKT.
    return drizzlePglite(new PGlite(), { schema }) as unknown as PostgresDb;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return drizzlePg(postgres(url, { max: 10 }), { schema });
}

function getDb(): Db {
  return globalThis.__db ?? (globalThis.__db = createDb());
}

// Reuse a single connection across Next.js hot reloads / route handlers. Constructed
// lazily via a proxy so importing a route at build time (no DATABASE_URL) doesn't connect —
// the driver is only created on first actual query.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

// Apply migrations. Called once at startup (prod) and per test-file (vitest.setup.ts).
// Picks the migrator that matches the active driver.
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (usePglite) {
    await migratePglite(db as unknown as PgliteDb, { migrationsFolder });
  } else {
    await migratePg(db, { migrationsFolder });
  }
}

export { schema };
