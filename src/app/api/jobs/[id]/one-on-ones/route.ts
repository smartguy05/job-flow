import { collectionRoutes } from "@/lib/growth-routes";

// 1:1 meetings for a job; notes are private and never sent to the LLM. GET lists, POST creates.
export const { GET, POST } = collectionRoutes("oneOnOnes");
