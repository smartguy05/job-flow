import { collectionRoutes } from "@/lib/growth-routes";

// Performance reviews for a job. GET lists, POST creates.
export const { GET, POST } = collectionRoutes("reviews");
