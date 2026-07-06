/**
 * Resume Generator — Reference Template
 *
 * Illustrates the docx-js structure and formatting. It is NOT filled with real content:
 * every [PLACEHOLDER] and comment marks something to populate from the user's career info,
 * tailored to the target job. Adapt:
 * - Contact header  (pull name, links, and details from the career info)
 * - Professional summary  (tailor to the target role)
 * - Skills section  (choose categories the career info supports; most-relevant first)
 * - Professional experience  (reverse-chronological; full bullets for recent/relevant roles)
 * - Earlier experience  (summarize older roles to one line each)
 * - Projects  (include the most relevant documented projects, or omit the section)
 * - "Why [Company]" section  (generate fresh for each application)
 *
 * Usage: npm install -g docx && node generate_resume.js
 */

const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, ExternalHyperlink
} = require('docx');
const fs = require('fs');

// === COLOR PALETTE ===
// A professional, high-contrast default. Adjust to taste.
const COLORS = {
  primary: "1a365d",      // Deep navy - name, section headers, skill labels
  accent: "2b6cb0",       // Blue - links, bullets, underlines
  text: "1a202c",         // Near black - body text
  muted: "4a5568",        // Gray - dates, locations, secondary info
};

// === HELPER FUNCTIONS ===

function sectionHeader(text) {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 21,
        font: "Arial",
        color: COLORS.primary
      })
    ],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent, space: 3 }
    }
  });
}

function jobHeader(title, company, location, dates) {
  return new Paragraph({
    spacing: { before: 140, after: 50 },
    children: [
      new TextRun({ text: title, bold: true, size: 20, font: "Arial", color: COLORS.text }),
      new TextRun({ text: "  |  ", size: 20, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: company, size: 20, font: "Arial", color: COLORS.primary }),
      new TextRun({ text: "  |  ", size: 20, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: location, size: 20, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: "  (" + dates + ")", size: 19, font: "Arial", color: COLORS.muted, italics: true })
    ]
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 45 },
    indent: { left: 240, hanging: 160 },
    children: [
      new TextRun({ text: "• ", size: 19, font: "Arial", color: COLORS.accent }),
      new TextRun({ text: text, size: 19, font: "Arial", color: COLORS.text })
    ]
  });
}

function skillCategory(category, skills) {
  return new Paragraph({
    spacing: { after: 50 },
    children: [
      new TextRun({ text: category + ": ", bold: true, size: 19, font: "Arial", color: COLORS.primary }),
      new TextRun({ text: skills, size: 19, font: "Arial", color: COLORS.text })
    ]
  });
}

function earlyCareerLine(title, company, dates, description) {
  return new Paragraph({
    spacing: { after: 50 },
    children: [
      new TextRun({ text: title, bold: true, size: 19, font: "Arial" }),
      new TextRun({ text: " — " + company + " (" + dates + "): ", size: 19, font: "Arial", color: COLORS.muted }),
      new TextRun({ text: description, size: 19, font: "Arial" })
    ]
  });
}

function projectLine(name, tech, description) {
  return new Paragraph({
    spacing: { after: 45 },
    children: [
      new TextRun({ text: name, bold: true, size: 19, font: "Arial", color: COLORS.primary }),
      new TextRun({ text: " (" + tech + ") — " + description, size: 19, font: "Arial", color: COLORS.text })
    ]
  });
}

// === DOCUMENT STRUCTURE ===
// Build the children array from the user's career info, tailored to the target job.

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },  // US Letter
        margin: { top: 620, right: 620, bottom: 620, left: 620 }  // ~0.43"
      }
    },
    children: [
      // === HEADER === (pull all values from the career info)
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({ text: "[FULL NAME]", bold: true, size: 40, font: "Arial", color: COLORS.primary })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 },
        children: [
          // Adapt the headline/subtitle to the target role
          new TextRun({ text: "[HEADLINE / TARGET-ROLE SUBTITLE]", size: 21, font: "Arial", color: COLORS.muted })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          // Include only the contact details / links present in the career info.
          new TextRun({ text: "[Location]  •  [Phone]  •  [Email]  •  ", size: 18, font: "Arial", color: COLORS.text }),
          new ExternalHyperlink({
            link: "[WEBSITE URL]",
            children: [new TextRun({ text: "[website]", size: 18, font: "Arial", color: COLORS.accent })]
          }),
          new TextRun({ text: "  •  ", size: 18, font: "Arial", color: COLORS.muted }),
          new ExternalHyperlink({
            link: "[GITHUB URL]",
            children: [new TextRun({ text: "GitHub", size: 18, font: "Arial", color: COLORS.accent })]
          }),
          new TextRun({ text: "  •  ", size: 18, font: "Arial", color: COLORS.muted }),
          new ExternalHyperlink({
            link: "[LINKEDIN URL]",
            children: [new TextRun({ text: "LinkedIn", size: 18, font: "Arial", color: COLORS.accent })]
          })
        ]
      }),

      // === PROFESSIONAL SUMMARY ===
      // 3-4 sentences tailored to the target role; lead with the most relevant experience.
      sectionHeader("Professional Summary"),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: "[GENERATE: 3-4 sentence summary tailored to the target role, drawn entirely from the career info. Lead with the most relevant experience; mention years of experience, key specializations, and relevant domain background.]",
            size: 19,
            font: "Arial",
            color: COLORS.text
          })
        ]
      }),

      // === TECHNICAL / CORE SKILLS ===
      // Choose categories the career info supports; order most-relevant-to-the-role first.
      sectionHeader("Skills"),
      skillCategory("[Category 1]", "[comma-separated skills from career info]"),
      skillCategory("[Category 2]", "[comma-separated skills from career info]"),
      skillCategory("[Category 3]", "[comma-separated skills from career info]"),
      // ...add categories as the career info supports.

      // === PROFESSIONAL EXPERIENCE ===
      // Reverse-chronological. Full bullets (3-5) for recent/relevant roles; end each with
      // a "Technologies:" line listing only technologies the career info attributes to it.
      sectionHeader("Professional Experience"),

      jobHeader("[Title]", "[Company]", "[Location]", "[Start – End]"),
      bullet("[Accomplishment tailored to the target role — verifiable from the career info]"),
      bullet("[Accomplishment — verifiable from the career info]"),
      bullet("[Accomplishment — verifiable from the career info]"),
      bullet("Technologies: [only technologies the career info attributes to this role]"),

      jobHeader("[Title]", "[Company]", "[Location]", "[Start – End]"),
      bullet("[Accomplishment — verifiable from the career info]"),
      bullet("[Accomplishment — verifiable from the career info]"),
      bullet("Technologies: [only technologies the career info attributes to this role]"),
      // ...repeat for each recent/relevant role.

      // === EARLIER EXPERIENCE === (one summarized line per older role)
      sectionHeader("Earlier Experience"),
      earlyCareerLine("[Title]", "[Company]", "[Dates]", "[one-line description from career info]"),
      earlyCareerLine("[Title]", "[Company]", "[Dates]", "[one-line description from career info]"),
      // ...repeat as needed.

      // === PROJECTS === (optional; include the most relevant documented projects, or omit)
      sectionHeader("Projects"),
      projectLine("[Project]", "[Tech]", "[15-30 word description emphasizing what matters for this role]"),
      projectLine("[Project]", "[Tech]", "[15-30 word description]"),
      // Optional pointer to a portfolio/profile if the career info has one:
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "[Additional projects]", bold: true, size: 19, font: "Arial", color: COLORS.muted }),
          new TextRun({ text: " at [portfolio / GitHub link]", size: 19, font: "Arial", color: COLORS.text })
        ]
      }),

      // === WHY [COMPANY] ===
      // Generate fresh per application from: the company's mission/products (job description +
      // research), how the user's real experience aligns, and their genuine values per the
      // career info. Keep it in the user's voice; never invent motivations.
      sectionHeader("Why [Company Name] & [Role]"),
      new Paragraph({
        children: [
          new TextRun({
            text: "[GENERATE: 3-5 sentences in the user's voice. Reference specific products/mission that resonate, connect real experience to the role, and close with a forward-looking note. Everything must be authentic to the career info.]",
            size: 19,
            font: "Arial",
            color: COLORS.text
          })
        ]
      })
    ]
  }]
});

// === GENERATE OUTPUT ===
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('[Name]_Resume_[Company].docx', buffer);
  console.log('Resume created successfully!');
});
