# Offer comparison

Compare competing job offers side by side with an AI recommendation. Users multi-select two
or more of their applications, optionally state what matters most, and get a deterministic
comparison table plus an AI verdict. Comparisons are saved and revisitable.

## Surface

A top-level **Offers** page (`/offers`, in the nav) lists saved comparisons and hosts the
builder (multi-select applications + optional priorities + title). Generating navigates to
`/offers/[id]`, which renders the saved snapshot. Pages live in `src/app/offers/`.

## The two halves

**Deterministic table** (`buildOfferTable` in `src/lib/offer-comparison.ts`, pure + unit
tested): a side-by-side of the structured `applications` fields — pay (via `formatPay` from
`src/lib/job-fields.ts`), bonus, benefits, location, employment type, seniority, tech stack,
company size/stage/industry, interest rating, pros/cons. No LLM.

**AI verdict** (`generateOfferComparison` in `src/lib/llm.ts`, validated by
`OfferComparisonVerdictSchema` in `src/lib/offer-comparison-content.ts`): `summary`,
`recommendation { applicationId, rationale }`, `ranking[]`, `factors[]`, and `risks[]`. It
weighs the structured data, each app's own pros/cons and interest rating, the career profile,
optional stated priorities, and any uploaded benefits documents. Priorities steer the verdict
when provided; otherwise fit is inferred from the profile + per-offer notes.

## Application files (upload, store & download)

Users can upload files against an **application** (reusable across comparisons) of four
kinds — `resume`, `cover_letter`, `message`, `benefits` — stored in `application_files` as
`bytea` (see the [data model](../architecture/data-model.md)). `benefits` accepts PDF only;
the other three kinds accept PDF or DOCX. All four are surfaced in a "Files" panel on the
application detail page, grouped by kind, with a kind selector on upload and per-file
download/delete. `resume`/`cover_letter`/`message` uploads are store-and-download only — they
are never sent to an LLM. Only `benefits` detail (often a PDF packet) feeds the AI verdict: a
comparison automatically pulls the benefits PDFs of every included application and passes
them to the model.

Rather than adding a PDF-parsing/OCR library, the shared LLM layer was extended: `CompleteOpts`
gained an optional `documents: LlmDocument[]` (base64 PDFs) that `complete()` attaches to the
last user message as **native document blocks** — Anthropic `document` blocks, OpenAI `file`
parts. Both providers read PDFs directly. See
[resume generation](resume-generation.md#llm-provider) for the provider layer.

## Persistence

Saved comparisons live in `offer_comparisons`. `result_json` snapshots `{ table, verdict }` at
generation time, and `application_ids` is a JSON array (not a FK), so a saved comparison stays
stable even if an included application is later edited or deleted.

## API

`GET/POST /api/offers/comparisons` and `GET/DELETE /api/offers/comparisons/[id]`, plus the
per-application file routes under `/api/applications/[id]/files`. See the
[API reference](../api/reference.md).

## Related

- [Applications & tracking](applications-and-tracking.md) · [Interview prep](interview-prep.md) ·
  [Resume generation](resume-generation.md) · [API reference](../api/reference.md) ·
  [Data model](../architecture/data-model.md)
