# Database layer

Implemented in `src/db/index.ts`. Uses Drizzle ORM over two interchangeable drivers.

## Driver selection

```
usePglite = NODE_ENV === "test" || USE_PGLITE === "1"
```

- **Production/dev** → `postgres.js` (`drizzle-orm/postgres-js`), connecting to
  `DATABASE_URL` (pool `max: 10`).
- **Tests** → `@electric-sql/pglite` (`drizzle-orm/pglite`), an in-process Postgres. With
  Vitest `isolate: true`, each test file gets its own fresh in-memory DB. See
  [testing](../operations/testing.md).

Both expose the identical `PgDatabase` query-builder API, so all call sites are
driver-agnostic. The exported `Db` type is the `postgres.js` type; the pglite instance is
bridged with a cast.

## Lazy `db` proxy

`db` is a `Proxy` that constructs the real client on first property access, not at import:

```ts
export const db: Db = new Proxy({} as Db, { get(_t, prop) { /* build on first use */ } });
```

This matters because `next build` imports every route module to collect metadata. Eager
construction would call `postgres(DATABASE_URL)` at import and throw when `DATABASE_URL`
is unset during build. The proxy defers the connection to the first real query at runtime.

## Migrations

- Generated into `drizzle/` by `npx drizzle-kit generate` (dialect `postgresql`, config in
  `drizzle.config.ts`).
- Applied by `runMigrations()` in `src/db/index.ts`, which picks the migrator matching the
  active driver (`postgres-js/migrator` or `pglite/migrator`).
- **At startup**, `src/instrumentation.ts` calls `runMigrations()` once when the Next
  server boots (Node runtime only), with a short retry loop so the app tolerates Postgres
  still coming up. Set `SKIP_DB_MIGRATE=1` to skip (e.g. build-time image assembly).
- **In tests**, `vitest.setup.ts` calls `runMigrations()` per file before seeding.

### Migration parity

The same generated SQL must apply cleanly on both pglite and real Postgres. After
generating, verify against a throwaway Postgres:

```bash
docker run -d --name pgtest -e POSTGRES_USER=jobflow -e POSTGRES_PASSWORD=jobflow \
  -e POSTGRES_DB=jobflow -p 55432:5432 postgres:17-alpine
DATABASE_URL=postgres://jobflow:jobflow@localhost:55432/jobflow npx drizzle-kit migrate
docker rm -f pgtest
```

## Query conventions

- The API is **async**: `await db.select()...`, `await db.insert()...`. There is no
  `.get()/.all()/.run()` (those were the sync SQLite API).
- Single row: `const [row] = await db.select()...limit(1)`.
- Insert returning: `const [row] = await db.insert()...returning({ id })`.
- Upsert: `.onConflictDoUpdate({ target, set })` — for composite PKs, `target` is an array
  of columns (e.g. `[settings.userId, settings.key]`).

## Related

- [Data model](data-model.md) · [Testing](../operations/testing.md) ·
  [Configuration](../operations/configuration.md) · [Deployment](../operations/deployment.md)
