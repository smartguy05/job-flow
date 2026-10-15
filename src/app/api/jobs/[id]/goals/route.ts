import { collectionRoutes } from "@/lib/growth-routes";

// Goals / OKRs for a job. GET lists, POST creates.
export const { GET, POST } = collectionRoutes("goals");
