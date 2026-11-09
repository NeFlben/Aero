import { HttpError, route } from "@/server/http";
import { lookupRegistration } from "@/server/registration";

/** Type, operators and build year behind a registration (hexdb.io and Wikimedia Commons). */
export const GET = route(async ({ req }) => {
  const reg = (req.nextUrl.searchParams.get("reg") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,11}$/.test(reg)) throw new HttpError(400, "bad_registration");
  return { info: await lookupRegistration(reg) };
}, { limit: 120 });
