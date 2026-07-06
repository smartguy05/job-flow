"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/ui";

type CareerFile = { id: number; name: string; content: string; updatedAt: string | null };

export default function ProfilePage() {
  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [proposed, setProposed] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  // Supplementary career files.
  const [files, setFiles] = useState<CareerFile[]>([]);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");

  // Editable resume skill.
  const [skill, setSkill] = useState("");
  const [skillDefault, setSkillDefault] = useState("");
  const [skillIsDefault, setSkillIsDefault] = useState(true);

  useEffect(() => {
    api<{ content: string; updatedAt: string | null }>("/api/career-profile").then((d) => {
      setContent(d.content);
      setUpdatedAt(d.updatedAt);
    });
    loadFiles();
    api<{ content: string; isDefault: boolean; default: string }>("/api/resume-skill").then((d) => {
      setSkill(d.content);
      setSkillIsDefault(d.isDefault);
      setSkillDefault(d.default);
    });
  }, []);

  function loadFiles() {
    api<CareerFile[]>("/api/career-files").then(setFiles);
  }

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(""), 2000);
  }

  async function save() {
    setBusy("save");
    await api("/api/career-profile", { method: "PUT", body: JSON.stringify({ content }) });
    setBusy("");
    flash("Saved.");
  }

  async function assist() {
    if (!instruction.trim()) return;
    setBusy("assist");
    try {
      const d = await api<{ content: string }>("/api/career-profile/assist", {
        method: "POST",
        body: JSON.stringify({ instruction }),
      });
      setProposed(d.content);
    } finally {
      setBusy("");
    }
  }

  function acceptProposed() {
    if (proposed) setContent(proposed);
    setProposed(null);
    setInstruction("");
  }

  async function addFile() {
    if (!newName.trim()) return;
    setBusy("addFile");
    try {
      await api("/api/career-files", { method: "POST", body: JSON.stringify({ name: newName, content: newContent }) });
      setNewName("");
      setNewContent("");
      loadFiles();
    } finally {
      setBusy("");
    }
  }

  async function saveFile(f: CareerFile) {
    setBusy(`file-${f.id}`);
    try {
      await api(`/api/career-files/${f.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: f.name, content: f.content }),
      });
      flash("File saved.");
    } finally {
      setBusy("");
    }
  }

  async function deleteFile(id: number) {
    await api(`/api/career-files/${id}`, { method: "DELETE" });
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function saveSkill() {
    setBusy("skill");
    try {
      await api("/api/resume-skill", { method: "PUT", body: JSON.stringify({ content: skill }) });
      setSkillIsDefault(!skill.trim());
      flash("Skill saved.");
    } finally {
      setBusy("");
    }
  }

  async function resetSkill() {
    setSkill("");
    setBusy("skill");
    try {
      await api("/api/resume-skill", { method: "PUT", body: JSON.stringify({ content: "" }) });
      setSkillIsDefault(true);
      flash("Reset to default.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Career profile</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Source of truth for every generated resume. Last updated {fmtDate(updatedAt)}.
        </p>
      </div>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">Add details with AI</h2>
        <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
          Describe new work, a project, or an accomplishment. The AI folds it into the right section — review before saving.
        </p>
        <textarea className="textarea" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder='e.g. "I built a rate-limiting layer for the LLM gateway that cut costs 30%. Add it."' />
        <button className="btn btn-primary mt-2" disabled={busy === "assist" || !instruction.trim()} onClick={assist}>
          {busy === "assist" ? "Thinking…" : "Draft update"}
        </button>

        {proposed && (
          <div className="mt-4">
            <label className="label">Proposed document (review)</label>
            <textarea className="textarea" rows={12} value={proposed} onChange={(e) => setProposed(e.target.value)}
              style={{ borderColor: "var(--accent)" }} />
            <div className="flex gap-2 mt-2">
              <button className="btn btn-primary" onClick={acceptProposed}>Use this version</button>
              <button className="btn btn-ghost" onClick={() => setProposed(null)}>Discard</button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold">Edit profile (Markdown)</h2>
          <div className="flex items-center gap-3">
            {msg && <span className="text-sm" style={{ color: "var(--success)" }}>{msg}</span>}
            <button className="btn btn-primary" disabled={busy === "save"} onClick={save}>
              {busy === "save" ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
        <textarea className="textarea font-mono max-h-[55vh] md:max-h-none" style={{ fontSize: "0.8rem" }} rows={28}
          value={content} onChange={(e) => setContent(e.target.value)} />
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">Career files</h2>
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          Extra source documents (past resumes, brag docs, project write-ups). Their text is added to the
          generation context alongside your profile.
        </p>

        <div className="flex flex-col gap-4">
          {files.map((f, i) => (
            <div key={f.id} className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <input
                  className="input flex-1 font-medium"
                  value={f.name}
                  onChange={(e) => setFiles((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <button className="btn btn-primary" disabled={busy === `file-${f.id}`} onClick={() => saveFile(f)}>
                  {busy === `file-${f.id}` ? "Saving…" : "Save"}
                </button>
                <button className="btn btn-ghost" onClick={() => deleteFile(f.id)}>Delete</button>
              </div>
              <textarea
                className="textarea font-mono"
                style={{ fontSize: "0.8rem" }}
                rows={8}
                value={f.content}
                onChange={(e) => setFiles((prev) => prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md border p-3" style={{ borderColor: "var(--accent)" }}>
          <label className="label">Add a file</label>
          <input className="input mb-2" placeholder="Name, e.g. Past resume 2023" value={newName}
            onChange={(e) => setNewName(e.target.value)} />
          <textarea className="textarea font-mono" style={{ fontSize: "0.8rem" }} rows={6}
            placeholder="Paste the document text…" value={newContent} onChange={(e) => setNewContent(e.target.value)} />
          <button className="btn btn-primary mt-2" disabled={busy === "addFile" || !newName.trim()} onClick={addFile}>
            {busy === "addFile" ? "Adding…" : "Add file"}
          </button>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="font-semibold">Resume skill</h2>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" disabled={busy === "skill"} onClick={resetSkill}>Reset to default</button>
            <button className="btn btn-primary" disabled={busy === "skill"} onClick={saveSkill}>
              {busy === "skill" ? "Saving…" : "Save skill"}
            </button>
          </div>
        </div>
        <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
          The instructions that steer how your resumes are generated. {skillIsDefault ? "Using the built-in default." : "Using your custom version."}
        </p>
        <textarea
          className="textarea font-mono max-h-[55vh] md:max-h-none"
          style={{ fontSize: "0.8rem" }}
          rows={20}
          value={skill}
          placeholder={skillDefault}
          onChange={(e) => setSkill(e.target.value)}
        />
      </section>
    </div>
  );
}
