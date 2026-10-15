import { collectionRoutes } from "@/lib/growth-routes";

// People around a job (managers, skips, peers, reports, mentors, stakeholders). GET lists, POST creates.
export const { GET, POST } = collectionRoutes("people");
