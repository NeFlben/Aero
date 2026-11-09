import { route } from "@/server/http";
import { latestSnapshots, marketStatus } from "@/server/market";

export const GET = route(async ({ userId }) => ({ ...marketStatus(), latest: await latestSnapshots(userId) }));
