import type { NextRequest } from "next/server";
import { getAuth } from "@/server/auth";

const handle = async (req: NextRequest) => (await getAuth()).handler(req);
export const GET = handle;
export const POST = handle;
