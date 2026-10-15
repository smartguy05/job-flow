import { collectionRoutes } from "@/lib/growth-routes";

// Equity grants for a job. GET lists (each with its derived vesting schedule), POST creates.
export const { GET, POST } = collectionRoutes("equity");
