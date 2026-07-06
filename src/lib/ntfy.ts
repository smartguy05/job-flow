import { getSettings } from "./settings";

export async function sendNtfy(
  userId: string,
  opts: {
    title: string;
    message: string;
    tags?: string[];
    click?: string;
  },
): Promise<boolean> {
  const s = await getSettings(userId);
  if (!s.ntfyEnabled || !s.ntfyUrl) return false;
  try {
    const headers: Record<string, string> = { Title: opts.title };
    if (opts.tags?.length) headers.Tags = opts.tags.join(",");
    if (opts.click) headers.Click = opts.click;
    const res = await fetch(s.ntfyUrl, { method: "POST", headers, body: opts.message });
    return res.ok;
  } catch {
    return false;
  }
}
