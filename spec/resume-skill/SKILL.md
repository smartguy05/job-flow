---
name: resume-builder
description: "Tailored resume generator. Use when a user asks to create a resume, CV, or job application document. Requires two inputs: (1) the user's career info (their career profile plus any supplementary career files) and (2) a target job (company, role, and job description). Produces a tailored, two-page resume whose every claim traces back to the career info, with a custom 'Why [Company]' section."
---

# Resume Builder

Generate a two-page resume tailored to a specific job posting, driven entirely by the
user's own career info. Nothing in the resume may be invented — the career info is the
single source of truth for every fact.

## Workflow

1. **Read the job** — Study the target company, role title, and job description. Note the
   required skills, technologies, responsibilities, and any signals about company mission
   or culture.
2. **Read the career info** — Parse the user's career profile and any supplementary career
   files. This is the complete, authoritative record of their experience.
3. **Analyze the match** — Identify which of the user's real skills, experiences, and
   projects align best with the role.
4. **Generate the resume** — Produce structured content (summary, skills, experience,
   earlier experience, projects, "Why [Company]"). Lead with what matters most to this role.
5. **Verify accuracy** — Cross-check every bullet, metric, technology, title, and date
   against the career info. Remove anything you cannot verify.
6. **Validate length** — Aim for content that fills exactly two pages (see below).
7. **Deliver** — Present the finished resume.

## Ensuring Exactly Two Pages

The resume should fill two pages — not one, not two-and-a-half. Adjust content density
rather than inventing facts.

**If too short (< 2 pages):**
- Expand bullets with more specific, verifiable detail (metrics, technologies, outcomes)
- Add context to the professional summary
- Include an additional relevant project
- Lengthen the "Why [Company]" section

**If too long (> 2 pages):**
- Reduce bullets on older or less-relevant roles
- Shorten project descriptions
- Condense the "Why [Company]" section

**Target word counts:**
- Professional summary: 60–80 words
- Each skill-category line: 15–25 words
- Job bullets: 15–35 words each
- Project descriptions: 15–30 words each
- "Why [Company]" section: 80–120 words

## Accuracy Verification (non-negotiable)

**NEVER fabricate or embellish content to match a job description.** Every claim must be
verifiable from the user's career info.

### Rules
1. **Technologies** — Only list technologies the career info attributes to that role.
2. **Metrics** — Only use numbers/percentages that appear in the career info.
3. **Job titles** — Use the exact titles from the career info.
4. **Dates** — Use the exact dates from the career info.
5. **Accomplishments** — Rephrase for relevance, but never invent new ones.
6. **Projects** — Only include projects documented in the career info.
7. **Contact info** — Pull name, contact details, and links from the career info; never
   guess or substitute.

### How to Tailor Without Fabricating
- **DO** lead with and expand the real experience that matches the job.
- **DO** de-emphasize less relevant experience (fewer bullets, less detail).
- **DO** reorder skill categories to lead with the most relevant.
- **DO** reuse the job posting's language/keywords to describe *real* experience.
- **DON'T** add technologies the career info doesn't attribute to that role.
- **DON'T** invent metrics or outcomes.
- **DON'T** claim experience that isn't in the career info.

### Verification Step
Before finalizing, cross-check each bullet against the career info:
- Is this technology listed for this specific role?
- Is this metric accurate?
- Is this accomplishment documented?

If you can't verify it, **remove it or rephrase using only verified information.**

## Content Rules

### Contact Info
Pull the name, subtitle/headline, location, phone, email, and links (website, GitHub,
LinkedIn, etc.) from the career info. Include only the links the user actually has. All
links should be clickable hyperlinks. Adapt the subtitle/headline to the target role.

### Professional Summary
3–4 sentences tailored to the target role. Lead with the most relevant experience.
Mention years of experience, key specializations, and any relevant domain background —
all drawn from the career info.

### Skills Section
Organize skills into a handful of categories and **order them with the most relevant
category for this role first.** Choose category names that fit the user's actual skill
set (e.g. Languages, Frontend, Backend, Data, Cloud/DevOps, AI/ML, Domain/Compliance) —
don't force categories the career info doesn't support.

### Professional Experience
- **Reverse chronological order**, always.
- Give **full treatment (3–5 bullets)** to the most recent and most relevant roles;
  the current/most-recent role gets the most detail.
- **Summarize older roles** as a single line (title, company, dates, one-line description)
  once they add length without adding relevance.
- **End each full role with a "Technologies: …" line** listing only the technologies the
  career info attributes to that role.
- Weight bullets toward the target role: more bullets and detail on relevant roles, fewer
  on the rest.

### Projects (optional)
If the career info documents notable projects (open source, side projects, portfolio
work), include a **Projects** section with the 2–4 most relevant to the target role. Each
description should be 15–30 words and highlight the aspects that matter for this job. If
the user has a portfolio/GitHub with many more, close with a short line pointing to it
(e.g. "Additional projects at <link>"). Omit the section entirely if the career info has
no meaningful projects.

### "Why [Company]" Section
Write a short, authentic section connecting the user to this company and role, based on:
1. The company's mission, culture, and products (from the job description and any research)
2. How the user's real experience aligns with the role
3. The user's genuine interests and values as expressed in their career info

Keep it in the user's voice — specific and sincere, not generic filler. Never invent
personal motivations the career info doesn't support.

## Formatting Specifications

These are sensible defaults; the rendering layer may override them. Keep the resume clean,
consistent, and ATS-friendly.

| Element | Specification |
|---------|---------------|
| **Page count** | **Exactly 2 pages** |
| Margins | ~0.43" (620 DXA) |
| Font | One clean sans-serif throughout (e.g. Arial/Helvetica) |
| Name | Large (≈40pt), centered, primary color |
| Subtitle | Medium (≈21pt), centered, muted color |
| Section headers | ≈21pt, bold, primary color, accent underline |
| Body text | ≈19pt |
| Job headers | Title + Company + Location + Dates on one line |
| Bullets | Accent-colored bullet, ≈19pt |
| Colors | Choose a professional, high-contrast palette: a dark primary for name/headers, a mid accent for links/bullets/underlines, near-black body text, and a muted gray for dates/secondary info. |

## Output

Deliver the finished resume tailored to the target company and role.

## Template

See `scripts/generate_resume.js` for a reference docx-js structure with formatting
pre-configured. It is illustrative — adapt all content to the user's career info and the
target job.
