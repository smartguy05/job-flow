# Data model

Schema is defined in `src/db/schema.ts` (Drizzle `pgTable`s). Migrations are generated
into `drizzle/` — see [database layer](database.md).

## Multi-tenancy

Every domain table has a `userId uuid` foreign key to `users.id` with
`ON DELETE CASCADE`. There is no shared/global data. Enforcement:

- **List/create routes** filter selects by `userId` and set `userId` on inserts.
- **`[id]` routes** filter by `and(eq(table.id, id), eq(table.userId, user.id))` and
  return **404 (not 403)** when a row isn't owned — existence is never leaked.
- Composite indexes `(userId, id)` (top-level) and `(userId, applicationId)` (children)
  keep scoped queries fast.

See [sessions & middleware](../auth/sessions-and-middleware.md) for where `user.id` comes
from, and the [API reference](../api/reference.md) for per-route behavior.

## Tables

| Table | Key | Purpose |
|---|---|---|
| `users` | `id uuid` (PK), `sub` unique | Provisioned on first OIDC login; `sub` is the OIDC subject. `calendar_token` (nullable, unique) is the per-user token for the subscribable calendar feed, minted on first enable. |
| `settings` | `(userId, key)` PK | Per-user key/value (JSON-encoded values). |
| `contacts` | `id` identity | Recruiters/contacts. |
| `applications` | `id` identity | The core record (~40 columns). |
| `resumes` | `id` identity | Generated resume versions + file bytes. |
| `interviews` | `id` identity | Interview rounds per application. |
| `events` | `id` identity | Activity log (timeline + analytics). |
| `message_drafts` | `id` identity | Reply/cover-letter/follow-up drafts. |
| `career_profile` | `userId` PK | One master career-info markdown per user. |
| `career_files` | `id` identity | Supplementary source docs (many per user). |
| `resume_skill` | `userId` PK | Editable generation instructions (falls back to default). |

Integer PKs use `GENERATED ALWAYS AS IDENTITY`. Timestamps are `timestamptz` with a
JS-side default (`$defaultFn(() => new Date())`).

## Relationships

- `applications.contactId → contacts.id` (`ON DELETE SET NULL`).
- `resumes / interviews / events / message_drafts . applicationId → applications.id`
  (`ON DELETE CASCADE`) — deleting an application removes its children automatically.
- All of the above also carry `userId → users.id` (`ON DELETE CASCADE`).

## File storage (bytea)

Generated resume files live **in the database**, not on disk:

- `resumes.docxData` / `resumes.pdfData` are `bytea` (a Drizzle `customType` normalizing
  reads to a Node `Buffer`).
- `resumes.baseName` holds the descriptive filename stem (e.g.
  `Jane_Doe_Resume_Globex_v2`) used for downloads.
- JSON is stored as `text` and (de)serialized in code: `settings.value`,
  `resumes.contentJson`, `resumes.chatJson`.

Rendering writes to a temp workspace (LibreOffice needs real files), then reads the bytes
back for storage; downloads stream from the column. See
[resume generation](../features/resume-generation.md).

## Changing the schema

Edit `src/db/schema.ts`, then `npx drizzle-kit generate`, and verify the SQL applies on
both pglite and real Postgres (see [database layer](database.md)). Update this file and any
affected feature/API docs in the same change.

## Related

- [Database layer](database.md) · [OIDC flow](../auth/oidc-flow.md) ·
  [Resume generation](../features/resume-generation.md) · [API reference](../api/reference.md)
