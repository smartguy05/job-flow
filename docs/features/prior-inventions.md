# Prior inventions (Exhibit A)

Many employment agreements include an invention-assignment clause, and an "Exhibit A" where you list the **prior inventions and original works of authorship** you already own. Anything listed stays yours.

JobFlow stores that list as structured entries. AI helps you grow it, and the document is generated on demand as DOCX, PDF or plain text.

- Page: `/inventions`, shown in the nav as "Exhibit A" (`src/app/inventions/page.tsx`).
- Logic: `src/lib/inventions.ts`, `src/lib/exhibit-docx.ts`, `src/lib/invention-content.ts`, `src/lib/repo-source.ts` and `src/lib/docx-pdf.ts`.

## Entries

Each row in `inventions` has:
- a title
- a brief, deliberately general description
- a free-text date, such as "2019" or "2019–2021", since these are often approximate
- an identifying number (repo URL, patent or application number)
- a kind: `software`, `invention`, `authorship` or `other`
- technologies
- private notes, which are never exported
- `include_in_resume`
- a `sort_order`

New entries are appended to the end. `POST /api/inventions` accepts a single object or an array, for saving an import preview in one go.

## Adding entries with AI

Every AI path returns a **draft** for you to review and edit. Nothing is saved until you click Save. The prompts in `src/lib/llm.ts` say to use only the facts given and not to invent dates, identifiers or features.

- **Describe it.** `POST /api/inventions/draft` with `{ text }` calls `draftInvention()` and turns your own description, or a pasted README, into one entry.
- **From a GitHub repo.** `POST /api/inventions/draft` with `{ url }` calls `fetchRepoContext()`, which reads the repo's public metadata (description, created and pushed dates, language, topics, license) and its README, truncated, from `api.github.com`, then drafts an entry from them. If the model doesn't give an identifier, the repo URL is used.
  - Only `github.com` repo URLs are accepted, so a multi-user server never fetches hosts a user supplies (SSRF).
  - Private repos and other hosts get a 400 that tells you to paste the README instead.
- **Suggest from my history.** `POST /api/inventions/suggest` builds a history with `inventionHistory()` from your career profile, career files, jobs and work journal (complaints excluded), and calls `suggestInventions()`.
  - Each suggestion has a `source`, and an `ownershipCaution` when it looks like it was made while employed or with an employer's resources.
  - The AI flags those but never decides ownership.
  - Titles already on your list are filtered out, using `normalizeTitle()`.
- **Import existing Exhibit A.** `POST /api/inventions/import` takes an uploaded file (PDF, Word or text, read by `extractDocumentText()` in `src/lib/extract-text.ts`) or pasted `{ text }`.
  - It calls `extractInventions()` and returns a preview, flagging entries whose title is already listed.
  - The selected entries are saved with the array form of `POST /api/inventions`.

## Export

`GET /api/inventions/export?fmt=text|docx|pdf&ids=…` renders the document on demand. Nothing is stored, and `ids` limits the export to the entries you selected on the page.

- **DOCX:** `buildExhibitDocx()` produces the "EXHIBIT A — List of Prior Inventions and Original Works of Authorship" heading, then a Title | Date | Identifying number or brief description table, then signature, name and date lines. The name comes from your account. With no entries, it states there is nothing to disclose.
- **PDF:** the same DOCX, converted by `docxToPdf()` through headless LibreOffice. This is the conversion helper `renderResume()` now shares.
- **Text:** `exhibitText()` produces a numbered list with the same signature block, for "Copy as text".

Private notes and the resume flag are never part of the output.

## Resumes

Entries are private by default. Turning on **Include in resume** for an entry adds it to the "Personal projects & inventions" section that `resumeInventionsSection()` builds. `getCareerInfo()` (`src/lib/career.ts`) appends that section after the career profile and files, so resume generation, refinement and message drafts can draw on it.

Entries that aren't opted in never leave the Exhibit A page. Profile sync ([employment history](employment-history.md)) never touches inventions.

## Related

- [Resume generation](resume-generation.md)
- [Employment history](employment-history.md)
- [Data model](../architecture/data-model.md)
- [API reference](../api/reference.md)
