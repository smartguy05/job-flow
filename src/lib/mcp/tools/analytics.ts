import { z } from "zod";
import { getAnalytics } from "@/lib/services/analytics";
import { defineTool, READ_ONLY } from "../tool";

export const getAnalyticsTool = defineTool({
  name: "get_analytics",
  title: "Outcome analytics",
  description:
    "The user's job-search outcome analytics: totals, response/interview rates, a funnel by source channel " +
    "(applied → responded → interviewed → offer, with conversion rates), median/p75 days to first response, " +
    "and response rate by resume variant, seniority, location mode and interest rating. Buckets with fewer " +
    "than 5 applications carry smallSample: true — say so rather than drawing strong conclusions from them.",
  inputSchema: z.object({}),
  annotations: READ_ONLY,
  async handler(userId) {
    return getAnalytics(userId);
  },
});
