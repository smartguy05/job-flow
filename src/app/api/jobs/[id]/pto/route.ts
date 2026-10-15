import { collectionRoutes } from "@/lib/growth-routes";

// PTO entries for a job. GET lists (newest first), POST creates.
export const { GET, POST } = collectionRoutes("pto");
