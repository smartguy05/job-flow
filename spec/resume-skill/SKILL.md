---
name: anthony-resume-builder
description: "Custom resume generator for Anthony James. Use when Anthony asks to create a resume, CV, or job application document. Requires two inputs: (1) Anthony's career info file (uploaded), and (2) a job posting URL to fetch and analyze. Generates a tailored 2-page resume in both .docx and .pdf formats with a custom Why Company section."
---

# Anthony James Resume Builder

## Workflow

1. **Fetch the job posting** — Use `web_fetch` on the provided URL to get full job requirements
2. **Read the career file** — Parse Anthony's uploaded career info file from `/mnt/user-data/uploads/`
3. **Analyze the match** — Identify which skills, experiences, and projects align best with the role
4. **Generate the resume** — Use the docx-js script in `scripts/generate_resume.js` as a template
5. **Verify accuracy** — Cross-check every bullet, metric, and technology against the career file. Remove anything not verifiable.
6. **Convert to PDF** — Run `soffice --headless --convert-to pdf`
7. **Validate page count** — Run `pdfinfo [file].pdf | grep Pages` and confirm exactly 2 pages
8. **If not 2 pages** — Adjust content:
   - If <2 pages: Add more detail to bullets using ONLY verified information from career file
   - If >2 pages: Condense older job bullets, shorten project descriptions
9. **Present both files** — Deliver .docx and .pdf to user

## Critical: Ensuring Exactly 2 Pages

The resume MUST be exactly 2 full pages — not 1.5, not 2.5. To achieve this:

**If resume is too short (<2 pages):**
- Expand bullet points with more specific details (metrics, technologies, outcomes)
- Add more context to the Professional Summary
- Include 4 projects instead of 3 in Open Source section
- Add more detail to the "Why [Company]" section

**If resume is too long (>2 pages):**
- Reduce older job bullets from 5 to 4
- Shorten project descriptions
- Condense the "Why [Company]" section

**Target word counts:**
- Professional Summary: 60-80 words
- Each skill category line: 15-25 words
- Job bullets: 15-35 words each
- Project descriptions: 15-30 words each
- "Why [Company]" section: 80-120 words

## Critical: Accuracy Verification

**NEVER fabricate or embellish content to match a job description.** Every claim must be verifiable from Anthony's uploaded career file.

### Rules
1. **Technologies** — Only list technologies explicitly mentioned in the career file for each role
2. **Metrics** — Only use numbers/percentages that appear in the career file (e.g., "90% memory reduction", "$50K savings", ">95% accuracy")
3. **Job titles** — Use exact titles from the career file
4. **Dates** — Use exact dates from the career file
5. **Accomplishments** — Rephrase for relevance, but never invent new accomplishments
6. **Projects** — Only include open source projects documented in the career file

### How to Tailor Without Fabricating
- **DO:** Emphasize existing experience that matches the job (lead with it, add more detail)
- **DO:** De-emphasize less relevant experience (fewer bullets, less detail)
- **DO:** Reorder skills categories to lead with most relevant
- **DO:** Use language/keywords from job posting to describe real experience
- **DON'T:** Add technologies Anthony didn't use at that job
- **DON'T:** Invent metrics or outcomes
- **DON'T:** Claim experience that isn't in the career file

### Verification Step
Before finalizing, cross-check each bullet point against the career file:
- Is this technology listed for this specific job? 
- Is this metric accurate?
- Is this accomplishment documented?

If you can't verify it from the career file, **remove it or rephrase using only verified information.**

## Content Rules

### Contact Info (pull from career file)
- Name, Phone, Email, GitHub, LinkedIn, Resume Website
- All links should be clickable hyperlinks

### Job History
- **Reverse chronological order** — always
- **Full descriptions** for jobs from Federal Reserve Bank (Aug 2018) onward:
  - ONEflight: **5 bullets**, each 20-35 words (current role, most detail)
  - Turn Commerce: **5 bullets**, each 15-25 words
  - Redwood Trust: **5 bullets**, each 15-25 words
  - Bank of America: **5 bullets**, each 15-25 words
  - Ntirety: **4 bullets**, each 15-25 words
  - Federal Reserve: **4 bullets**, each 15-25 words
- **Summarized (1 line + dates)** for jobs before Federal Reserve Bank
- **Redwood Trust correction**: Only used OpenAI API, never Gemini
- **Always include a "Technologies:" bullet** as the last bullet for each full job entry

### Open Source Projects
Always include **at least one flagship project**:
- **Net-Guardian-AI** — AI-powered network security with Claude threat analysis, anomaly detection, prompt injection detection
- **ai.orchestrator** — AI agent orchestration framework with plugin architecture
- **DataQuery Pro** — CLI tool for natural language database querying

**Section requirements:**
- Include **3-4 projects** total (1-2 flagship + relevant others)
- Each project description should be **15-30 words**
- Always end with "30+ repositories at github.com/smartguy05"

Include additional projects only if directly relevant to the target role.

### "Why [Company]" Section
Generate this section based on:
1. Web search about the company's mission, culture, and products
2. How Anthony's experience aligns with the role
3. Claude's prior knowledge of Anthony's interests and values

Keep it authentic to Anthony's voice — direct, builder-focused, anti-hype.

### Skills Section
Tailor skill categories to the target role. Common categories:
- AI & LLM, Dev Tools, Frontend, Backend, Data, Compliance

Lead with the most relevant category for the target position.

## Formatting Specifications

| Element | Specification |
|---------|---------------|
| **Page count** | **EXACTLY 2 pages — validate with pdfinfo** |
| Margins | 620 DXA (~0.43") |
| Font | Arial throughout |
| Name | 40pt, centered, primary color |
| Subtitle | 21pt, centered, muted color |
| Section headers | 21pt, bold, primary color, accent underline |
| Body text | 19pt |
| Job headers | Title + Company + Location + Dates on ONE line |
| Bullets | Accent color bullet point, 19pt |
| Spacing after bullets | 45 DXA |
| Spacing before section headers | 220 DXA |
| Colors | Primary: #1a365d, Accent: #2b6cb0, Text: #1a202c, Muted: #4a5568 |

## Output

1. Generate `/mnt/user-data/outputs/[Name]_Resume_[Company].docx`
2. Convert to `/mnt/user-data/outputs/[Name]_Resume_[Company].pdf`
3. Present both files to user

## Template

See `scripts/generate_resume.js` for the full docx-js template with all formatting pre-configured.
