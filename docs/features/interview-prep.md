# Interview prep pack

An AI-generated, per-round preparation pack attached to an interview. It tailors to the
specific job's requirements and seniority level and grounds every suggested answer in the
user's career profile, so nothing is fabricated.

## Scope & storage

A prep pack belongs to a single row in the `interviews` table (one per round — e.g. phone
screen vs. onsite), not to the application as a whole. It is stored as one JSON blob in
`interviews.prep_pack_json`, with `prep_generated_at` recording the last generation. The pack
is **regenerable and hand-editable** (mirroring the resume/debrief flow). See the
[data model](../architecture/data-model.md).

## Contents

The pack (validated by `InterviewPrepSchema` in `src/lib/interview-prep-content.ts`) has four
sections:

- **`researchBrief`** — a concise paragraph on the role/company and key talking points.
- **`likelyQuestions[]`** — `{ question, category, suggestedAnswer }`; a mix of behavioral and
  technical questions with STAR-style answers drawn from the career profile.
- **`questionsToAsk[]`** — smart questions for the candidate to ask the interviewer.
- **`studyChecklist[]`** — `{ topic, priority, why }`, prioritized for the role's level and
  tech stack.

## Generation

`generateInterviewPrep({ userId, application, interview })` in `src/lib/llm.ts` pulls the
career context via `getCareerInfo(userId)` (see [resume generation](resume-generation.md)) and
calls `complete()` in JSON mode, then validates with `InterviewPrepSchema`. It receives the
job's `company`, `roleTitle`, `jdSnapshot` (falling back to `sourceRaw`), `seniorityLevel`,
`techStack`, plus the interview's `round`/`interviewer`.

## API & UI

- `POST /api/interviews/[id]/prep` generates + persists the pack and logs an `interview_prep`
  event; `PATCH` saves hand-edits (see [API reference](../api/reference.md)).
- The application detail page (`src/app/applications/[id]/page.tsx`) renders a **Prep pack**
  panel per interview (`PrepPackPanel`) with Generate/Regenerate, a collapsible view, editable
  sections, and Save.

## Related

- [Applications & tracking](applications-and-tracking.md) · [Resume generation](resume-generation.md) ·
  [Offer comparison](offer-comparison.md) · [API reference](../api/reference.md) ·
  [Data model](../architecture/data-model.md)
