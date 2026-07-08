"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/ui";

type Settings = {
  dedupWindowDays: number;
  reminderQuietDays: number;
  expireApplicationsAfterDays: number;
  ntfyUrl: string;
  ntfyEnabled: boolean;
  provider: "anthropic" | "openai";
  anthropicModel: string;
  openaiModel: string;
  subtitleDefault: string;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  keyReadyForProvider: boolean;
};

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [feedMsg, setFeedMsg] = useState("");

  useEffect(() => { api<Settings>("/api/settings").then(setS); }, []);
  useEffect(() => { api<{ url: string | null }>("/api/calendar/token").then((r) => setFeedUrl(r.url)); }, []);

  async function enableFeed() {
    const { url } = await api<{ url: string }>("/api/calendar/token", { method: "POST" });
    setFeedUrl(url);
    setFeedMsg(feedUrl ? "New URL generated — the old one no longer works." : "Feed enabled.");
    setTimeout(() => setFeedMsg(""), 4000);
  }

  async function copyFeed() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setFeedMsg("Copied to clipboard.");
    setTimeout(() => setFeedMsg(""), 2000);
  }

  async function save() {
    if (!s) return;
    setBusy(true);
    await api("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    setBusy(false);
    setMsg("Saved.");
    setTimeout(() => setMsg(""), 2000);
  }

  async function testNtfy() {
    const { ok } = await api<{ ok: boolean }>("/api/settings/test-ntfy", { method: "POST" });
    setMsg(ok ? "Test push sent." : "Push failed — check URL and that it's enabled + saved.");
    setTimeout(() => setMsg(""), 4000);
  }

  if (!s) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {!s.keyReadyForProvider && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {s.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is not set on the server.
          Resume generation and drafts will fail until the active provider&apos;s key is configured.
        </div>
      )}

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-semibold">Duplicate detection</h2>
        <div>
          <label className="label">Warn if applied to the same company + similar role within (days)</label>
          <input className="input" type="number" value={s.dedupWindowDays}
            onChange={(e) => setS({ ...s, dedupWindowDays: parseInt(e.target.value) || 0 })} />
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-semibold">Application lifecycle</h2>
        <div>
          <label className="label">Auto-expire an open application after no activity for (days, 0 to disable)</label>
          <input className="input" type="number" value={s.expireApplicationsAfterDays}
            onChange={(e) => setS({ ...s, expireApplicationsAfterDays: parseInt(e.target.value) || 0 })} />
        </div>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-semibold">Follow-up reminders (ntfy push)</h2>
        <div>
          <label className="label">Nudge me when an open application is quiet for (days)</label>
          <input className="input" type="number" value={s.reminderQuietDays}
            onChange={(e) => setS({ ...s, reminderQuietDays: parseInt(e.target.value) || 0 })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.ntfyEnabled} onChange={(e) => setS({ ...s, ntfyEnabled: e.target.checked })} />
          Enable ntfy push notifications
        </label>
        <div>
          <label className="label">ntfy topic URL</label>
          <input className="input" placeholder="https://ntfy.sh/your-private-topic" value={s.ntfyUrl}
            onChange={(e) => setS({ ...s, ntfyUrl: e.target.value })} />
        </div>
        <button className="btn btn-ghost self-start" onClick={testNtfy}>Send test push</button>
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-semibold">Calendar feed</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Subscribe from Google, Apple, or Outlook Calendar to see your interviews, application
          deadlines, and next actions. The link contains a private token — anyone with it can read
          these dates, so keep it to yourself. Add it in your calendar app as &ldquo;subscribe from
          URL&rdquo; (not a one-time import) so it stays in sync.
        </p>
        {feedUrl ? (
          <>
            <div>
              <label className="label">Your private feed URL</label>
              <input className="input" readOnly value={feedUrl} onFocus={(e) => e.target.select()} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button className="btn btn-ghost self-start" onClick={copyFeed}>Copy link</button>
              <button className="btn btn-ghost self-start" onClick={enableFeed}>Regenerate link</button>
              {feedMsg && <span className="text-sm" style={{ color: "var(--success)" }}>{feedMsg}</span>}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <button className="btn btn-primary self-start" onClick={enableFeed}>Enable calendar feed</button>
            {feedMsg && <span className="text-sm" style={{ color: "var(--success)" }}>{feedMsg}</span>}
          </div>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <h2 className="font-semibold">AI provider</h2>
        <div>
          <label className="label">Provider (used for extraction, generation, refinement, drafts)</label>
          <select className="select" value={s.provider}
            onChange={(e) => setS({ ...s, provider: e.target.value as Settings["provider"] })}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
          </select>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Anthropic key: {s.hasAnthropicKey ? "✓ set" : "✗ missing"} · OpenAI key: {s.hasOpenaiKey ? "✓ set" : "✗ missing"}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Anthropic model</label>
            <input className="input" value={s.anthropicModel} onChange={(e) => setS({ ...s, anthropicModel: e.target.value })} />
          </div>
          <div>
            <label className="label">OpenAI model</label>
            <input className="input" value={s.openaiModel} onChange={(e) => setS({ ...s, openaiModel: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Default subtitle</label>
          <input className="input" value={s.subtitleDefault} onChange={(e) => setS({ ...s, subtitleDefault: e.target.value })} />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        {msg && <span className="text-sm" style={{ color: "var(--success)" }}>{msg}</span>}
      </div>
    </div>
  );
}
