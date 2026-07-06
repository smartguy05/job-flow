/**
 * Anthony James Resume Generator Template
 * 
 * This is a reference template showing the exact docx-js structure and formatting.
 * Claude should adapt this template based on the target job, modifying:
 * - Skills section (reorder/emphasize based on job requirements)
 * - Bullet points (highlight most relevant experience)
 * - Open source projects (include flagship + relevant projects)
 * - "Why [Company]" section (generate fresh for each application)
 * 
 * Usage: npm install -g docx && node generate_resume.js
 */

const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, ExternalHyperlink
} = require('docx');
const fs = require('fs');

// === COLOR PALETTE ===
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
// Adapt the children array based on the target job

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },  // US Letter
        margin: { top: 620, right: 620, bottom: 620, left: 620 }  // ~0.43"
      }
    },
    children: [
      // === HEADER ===
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({ text: "ANTHONY JAMES", bold: true, size: 40, font: "Arial", color: COLORS.primary })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 50 },
        children: [
          // Adapt subtitle based on target role
          new TextRun({ text: "Senior Software Engineer  •  AI & Developer Tools Specialist", size: 21, font: "Arial", color: COLORS.muted })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({ text: "Denver, CO  •  720-260-4498  •  dev.anthony.james.2024@gmail.com  •  ", size: 18, font: "Arial", color: COLORS.text }),
          new ExternalHyperlink({
            link: "https://resume.apetalo.us",
            children: [new TextRun({ text: "resume.apetalo.us", size: 18, font: "Arial", color: COLORS.accent })]
          }),
          new TextRun({ text: "  •  ", size: 18, font: "Arial", color: COLORS.muted }),
          new ExternalHyperlink({
            link: "https://github.com/smartguy05",
            children: [new TextRun({ text: "GitHub", size: 18, font: "Arial", color: COLORS.accent })]
          }),
          new TextRun({ text: "  •  ", size: 18, font: "Arial", color: COLORS.muted }),
          new ExternalHyperlink({
            link: "https://linkedin.com/in/anthony-james-70b10137",
            children: [new TextRun({ text: "LinkedIn", size: 18, font: "Arial", color: COLORS.accent })]
          })
        ]
      }),

      // === PROFESSIONAL SUMMARY ===
      // Adapt based on target role - lead with most relevant experience
      sectionHeader("Professional Summary"),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: "[GENERATE: 3-4 sentence summary tailored to the target role. Lead with most relevant experience. Mention years of experience, key specializations, compliance background, and passion for the work.]",
            size: 19,
            font: "Arial",
            color: COLORS.text
          })
        ]
      }),

      // === TECHNICAL EXPERTISE ===
      // Reorder categories based on job requirements - most relevant first
      sectionHeader("Technical Expertise"),
      skillCategory("AI & LLM", "Claude API, OpenAI GPT-5, Google Gemini, Llama (local), Tool Use, Prompt Engineering, Context Engineering, RAG, AI Agents"),
      skillCategory("Dev Tools", "Claude Code (power user), CLI Tools, IDE Extensions, VS Code Plugins, AI-Assisted Workflows, Custom Hooks & Skills"),
      skillCategory("Frontend", "React (Hooks, Context, Suspense), TypeScript, Angular 4-15, Blazor MAUI, Component Architecture, Performance Optimization"),
      skillCategory("Backend", "C#/.NET Core (14 yrs), Node.js, Python, Azure (5+ yrs), AWS, Docker, Kubernetes, gRPC, SignalR, Microservices"),
      skillCategory("Data", "PostgreSQL, SQL Server, Redis, Elastic Search, RabbitMQ, CI/CD Pipelines, Azure DevOps"),
      skillCategory("Compliance", "PCI-DSS, SOX, HIPAA, GDPR, WCAG 2.1 Accessibility, Federal Security Standards"),

      // === PROFESSIONAL EXPERIENCE ===
      sectionHeader("Professional Experience"),

      // ONEflight - Jun 2025 – Present
      jobHeader("Senior Software Engineer", "ONEflight International", "Denver, CO", "Jun 2025 – Present"),
      bullet("[Tailor bullets to target role - 4-5 bullets]"),
      bullet("Leading Claude Code optimization initiative—implementing AI-friendly documentation standards, custom hooks, skills, and agents to improve team-wide developer productivity"),
      bullet("Architecting AI flight assistant using multiple frontier LLMs (Claude, GPT-5, Gemini) with custom tool use implementations and context engineering"),
      bullet("Building cross-platform Blazor MAUI application with React component integration, real-time aircraft tracking, and SignalR"),
      bullet("Technologies: TypeScript, React, Blazor MAUI, C#/.NET Core, Azure, Claude API, OpenAI API, PostgreSQL, Redis, Kubernetes"),

      // Turn Commerce - Feb 2024 – Jan 2025
      jobHeader("Senior Software Engineer", "Turn Commerce (HugeDomains)", "Denver, CO", "Feb 2024 – Jan 2025"),
      bullet("Led microservices optimization across 10+ services; implemented DNSSEC across millions of domains"),
      bullet("Designed CI/CD pipelines in Azure DevOps; created comprehensive documentation standards"),
      bullet("Technologies: Angular, .NET 6-8, TypeScript, AWS, Azure DevOps, Elastic Search, RabbitMQ, Docker, PostgreSQL"),

      // Redwood Trust - Apr 2022 – Feb 2024
      // NOTE: Only OpenAI API was used here, NOT Gemini
      jobHeader("Senior Software Engineer", "Redwood Trust", "Denver, CO", "Apr 2022 – Feb 2024"),
      bullet("Built complete product in 6 months: Angular/Node.js app with Salesforce integration, custom CMS, SendGrid"),
      bullet("Pioneered AI integration: real estate classification system using OpenAI API with >95% accuracy"),
      bullet("Achieved 150-400% performance improvements across dozens of APIs via LINQ optimization and multi-threading"),
      bullet("Technologies: Angular, React, Node.js, TypeScript, C#, Azure, OpenAI API, Salesforce API, Ionic"),

      // Bank of America - Oct 2020 – Mar 2022
      jobHeader("Senior Software Engineer", "Bank of America", "Denver, CO", "Oct 2020 – Mar 2022"),
      bullet("Engineered virtual scrolling components handling 100,000+ records with 90% memory reduction"),
      bullet("Passed 3 security reviews with zero significant vulnerabilities in G-SIB environment; full WCAG 2.1 compliance"),
      bullet("Technologies: ASP.NET Core, Angular, TypeScript, SQL Server, AWS, Enterprise Security (SoD, IAM)"),

      // Ntirety - May 2019 – Oct 2020
      jobHeader("Full Stack Engineer / Team Lead", "Ntirety (Hosting.com)", "Denver, CO", "May 2019 – Oct 2020"),
      bullet("Led team of 3 devs + QA; primary developer on enterprise customer portal; migrated 1/3+ legacy app to Angular"),
      bullet("Fixed dozens of security vulnerabilities across SOC 1/2/3, HIPAA, HITRUST, PCI-DSS, GDPR frameworks"),
      bullet("Technologies: Angular 6-10, C#, ASP.NET Core, TypeScript, AWS, Azure, MS SQL Server"),

      // Federal Reserve - Aug 2018 – May 2019
      jobHeader("Full Stack Software Engineer", "Federal Reserve Bank", "Denver, CO", "Aug 2018 – May 2019"),
      bullet("Developed bank auditor portal for Federal Reserve examiners; created ~12 reusable Angular components"),
      bullet("Built secure OAuth APIs meeting federal standards; ensured Section 508/WCAG accessibility compliance"),
      bullet("Technologies: Angular 4-7, C#, ASP.NET Core, TypeScript, OAuth, Jenkins"),

      // === EARLIER EXPERIENCE (summarized) ===
      sectionHeader("Earlier Experience"),
      earlyCareerLine("Full Stack Engineer", "Governor's Office of IT, Denver", "Feb–Aug 2018", 
        "Federal transportation crash data system; CDOT/FHWA/NHTSA integration; dual Oracle/SQL Server architecture."),
      earlyCareerLine("Software Consultant", "Multiple Clients", "Apr 2015–Jan 2018",
        "PCI-DSS compliant ATM software (EMV, ISO 8583); casino gaming integrations; law enforcement inventory."),
      earlyCareerLine("Software Developer", "Synchronoss Technologies", "Apr 2015–Jun 2016",
        "Python plugins for enterprise telecom GIS platform (SpatialNET) enabling network tracing for major US ISPs."),
      earlyCareerLine("Software Developer / Sysadmin", "Triple Crown Casinos", "Feb 2010–Apr 2015",
        "$50K+ cost savings via in-house kiosk software; player tracking for 26K+ customers; BSA/AML compliance."),

      // === OPEN SOURCE & AI PROJECTS ===
      // Always include at least one flagship: Net-Guardian-AI, ai.orchestrator, or DataQuery Pro
      sectionHeader("Open Source & AI Projects"),
      projectLine("Net-Guardian-AI", "Python/TypeScript", 
        "AI-powered network security with Claude threat analysis, behavioral anomaly detection, Ollama LLM monitoring for prompt injection/jailbreak detection, and active response"),
      projectLine("ai.orchestrator", "C#", 
        "AI agent orchestration framework with plugin architecture enabling AI systems to interact with services and tools"),
      projectLine("DataQuery Pro", "TypeScript", 
        "CLI tool for natural language database querying with schema introspection and self-correcting queries"),
      projectLine("support_channel", "TypeScript", 
        "RAG-based support channel system for creating knowledge bases with custom data uploads"),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "30+ repositories", bold: true, size: 19, font: "Arial", color: COLORS.muted }),
          new TextRun({ text: " at github.com/smartguy05", size: 19, font: "Arial", color: COLORS.text })
        ]
      }),

      // === WHY [COMPANY] ===
      // Generate fresh for each application based on:
      // 1. Web search about company mission/culture/products
      // 2. How Anthony's experience aligns
      // 3. Claude's knowledge of Anthony's values (builder mindset, anti-hype, safety focus)
      sectionHeader("Why [Company Name] & [Role]"),
      new Paragraph({
        children: [
          new TextRun({
            text: "[GENERATE: 3-5 sentences in Anthony's voice. Direct, builder-focused, anti-hype. Mention specific products/mission that resonate. Connect his compliance background to their safety focus if applicable. End with forward-looking statement about building together.]",
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
  fs.writeFileSync('/mnt/user-data/outputs/Anthony_James_Resume_[Company].docx', buffer);
  console.log('Resume created successfully!');
});
