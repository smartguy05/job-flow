# Resume generation

Generates a two-page resume tailored to a specific application, drawing only from the
user's own career material. Files are stored in Postgres (see
[data model](../architecture/data-model.md)).

## Per-user source material

Each user supplies their own inputs (managed on the **Career profile** page,
`src/app/profile/page.tsx`):

- **Career profile** (`career_profile`, one row per user) — the master career-info
  markdown. `GET/PUT /api/career-profile`; AI-assisted editing via
  `POST /api/career-profile/assist` (`assistCareerProfile()` folds new details into the
  markdown for review before saving).
- **Career files** (`career_files`, many per user) — supplementary source documents (past
  resumes, brag docs, project write-ups). `GET/POST /api/career-files`,
  `PATCH/DELETE /api/career-files/[id]`.
- **Resume skill** (`resume_skill`, one row per user) — the editable instructions that
  steer generation. `GET/PUT /api/resume-skill`. When empty it **falls back to the shipped
  default** `spec/resume-skill/SKILL.md`; the GET response reports `isDefault` and the
  `default` text.

`src/lib/career.ts` assembles these for the model:

- `getCareerInfo(userId)` — career profile + each career file, concatenated.
- `getResumeSkill(userId)` — the user's skill, or the shipped default.
- `defaultResumeSkill()` — reads `spec/resume-skill/SKILL.md`.

> **Correctness property:** never fabricate. Every claim in a generated resume must trace
> to the assembled career info. Worth testing on any change here.

## Generation pipeline

1. `POST /api/applications/[id]/generate` → `createResumeForApplication(userId, appId)`
   (`src/lib/resume-service.ts`), after verifying the application is owned.
2. `generateResumeContent(userId, job)` (`src/lib/llm.ts`) builds structured JSON validated
   by the Zod schema in `src/lib/resume-content.ts`, using the assembled skill + career
   info and the target company/role/JD.
3. **Render** — `renderResume(content, baseName)` (`src/lib/render-resume.ts`):
   - `buildDocx()` composes the DOCX (`docx` library).
   - Writes to a **temp workspace**, shells to `soffice` (LibreOffice) to convert to PDF,
     `pdfinfo` (poppler) for the page count, and `pdftotext -bbox` (poppler) for the
     **last-page fill** — the fraction of the final page that content reaches, since
     `pdfinfo` only reports whole pages. Reads both files back as `Buffer`s and cleans up
     the temp dir. Returns `{ docx, pdf, pageCount, lastPageFill }`.
4. **2-page fit loop** — `renderWithPageFit()` re-renders up to 3 more times, calling
   `adjustForLength(userId, content, "expand"|"condense", pageCount, lastPageFill)` until
   the PDF is **exactly 2 pages with the last page at least 70% full**
   (`MIN_LAST_PAGE_FILL`). Over-length renders condense; a single page or an under-filled
   page 2 expands. This prevents a resume that merely spills one line onto page 2 (which
   `pdfinfo` still counts as 2 pages) from being treated as a complete two pages. If it
   can't converge, it stores a `fitWarning` naming the page count or the last-page fill %.
5. **Persist** — insert a `resumes` row with `userId`, incremented `version`,
   `contentJson`, `baseName`, and `docxData`/`pdfData` (`bytea`). Logs a
   `resume_generated` event.

## Review & refine

The editor (`src/app/resumes/[id]/page.tsx`) shows a live PDF preview beside the edit/refine
panel on large screens; on mobile the inline preview is dropped in favor of a "Preview PDF"
link (native viewer) with the editor first. See [mobile & PWA](mobile-and-pwa.md).

- `PATCH /api/resumes/[id]` — save hand-edited content (re-renders), finalize, or
  `markSent`. Re-rendering goes through `rerenderResume(userId, resumeId, content)`.
- `POST /api/resumes/[id]/refine` — free-text feedback ("lead with my AI work"). 
  `refineResumeContent()` revises the JSON (still verifiable against career info), appends
  to the chat history, and re-renders.

## Download (`GET /api/resumes/[id]/download`)

Streams bytes straight from `resumes.docxData` / `pdfData` (`?fmt=docx|pdf`,
`?inline=1` for inline disposition). The filename comes from `baseName`
(e.g. `Jane_Doe_Resume_Globex_v2.pdf`). Returns `404` if the format isn't present or the
resume isn't owned.

## LLM provider

All generation funnels through `complete()` in `src/lib/llm-provider.ts`, which dispatches on
the user's `provider` setting (Anthropic or OpenAI) and returns raw text (callers parse JSON).
Messages are plain strings, but `CompleteOpts` also accepts an optional
`documents: LlmDocument[]` (base64 PDFs) that `complete()` attaches to the last user message as
**native document blocks** — Anthropic `document` blocks, OpenAI `file` parts — so PDFs are
read directly with no OCR/parsing library. Only [offer comparison](offer-comparison.md) passes
documents today; every other generator is unaffected.

## Rendering dependencies

`soffice` (LibreOffice) and `pdfinfo` (poppler-utils) must be on `PATH` — provided in the
Docker image and required for local dev. See [deployment](../operations/deployment.md).

## Related

- [Applications & tracking](applications-and-tracking.md) · [Data model](../architecture/data-model.md) ·
  [API reference](../api/reference.md) · [Configuration](../operations/configuration.md)
