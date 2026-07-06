import type { ResumeContent } from "@/lib/resume-content";

// A minimal but schema-valid ResumeContent for use across tests.
export function makeResumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    contact: {
      name: "Anthony James",
      subtitle: "Senior Software Engineer",
      location: "Denver, CO",
      phone: "720-260-4498",
      email: "dev@example.com",
      website: "resume.example.com",
      websiteUrl: "https://resume.example.com",
      github: "GitHub",
      githubUrl: "https://github.com/smartguy05",
      linkedin: "LinkedIn",
      linkedinUrl: "https://linkedin.com/in/example",
    },
    summary: "Senior engineer with 14+ years of experience.",
    skills: [
      { category: "AI & LLM", skills: "OpenAI, Anthropic Claude, RAG" },
      { category: "Backend", skills: "C#/.NET, Node.js, Python" },
    ],
    jobs: [
      {
        title: "Senior Software Engineer",
        company: "ONEflight International",
        location: "Denver, CO",
        dates: "Jun 2025 – Present",
        bullets: ["Built an AI flight assistant.", "Technologies: TypeScript, C#, Azure"],
      },
    ],
    earlyRoles: [
      { title: "Software Developer", company: "Triple Crown Casinos", dates: "2010–2015", description: "Kiosk software." },
    ],
    projects: [{ name: "Net-Guardian-AI", tech: "Python", description: "AI network security." }],
    githubLine: "30+ repositories at github.com/smartguy05",
    whyCompany: { heading: "Why Globex", body: "Great fit for AI tooling work." },
    ...overrides,
  };
}
