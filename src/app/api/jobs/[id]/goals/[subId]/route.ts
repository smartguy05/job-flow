import { itemRoutes } from "@/lib/growth-routes";

// Edit or delete one row (scoped to the user and the job in the path).
export const { PATCH, DELETE } = itemRoutes("goals");
