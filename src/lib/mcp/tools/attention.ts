import { z } from "zod";
import { getSettings } from "@/lib/settings";
import { candidatesForUser } from "@/lib/services/attention";
import { defineTool, READ_ONLY } from "../tool";

export const needsAttention = defineTool({
  name: "needs_attention",
  title: "Applications needing attention",
  description:
    "Open applications that have gone quiet past the user's reminder window, or whose next action is overdue. " +
    "Use this to suggest follow-ups.",
  inputSchema: z.object({}),
  annotations: READ_ONLY,
  async handler(userId) {
    const { reminderQuietDays } = await getSettings(userId);
    const candidates = await candidatesForUser(userId, reminderQuietDays);
    return {
      quietDays: reminderQuietDays,
      applications: candidates.map((c) => ({
        id: c.id,
        company: c.company,
        roleTitle: c.roleTitle,
        status: c.status,
        reason: c.reason,
        daysQuiet: c.daysQuiet,
        nextAction: c.nextAction,
      })),
    };
  },
});
