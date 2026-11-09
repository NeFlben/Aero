import { route } from "@/server/http";
import { valuesFor } from "@/server/items";

export const GET = route(async ({ userId }) => ({ values: await valuesFor(userId) }));
