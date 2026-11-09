import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { asc, eq } from "drizzle-orm";
import { getDb, readyDb } from "@/db";
import * as schema from "@/db/schema";
import { sendMail } from "./mail";

/** In production the secret must be configured; locally one is generated once and kept in .data. */
function secret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) throw new Error("BETTER_AUTH_SECRET is required in production");
  const file = path.resolve(".data/auth-secret");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"));
  }
  return fs.readFileSync(file, "utf8");
}

function create() {
  return betterAuth({
    secret: secret(),
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : ["http://localhost:3000", "http://127.0.0.1:3000"],
    database: drizzleAdapter(getDb(), { provider: "pg", schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification } }),
    emailAndPassword: {
      enabled: true,
      // A private deployment: once the owner's account exists, nobody else can create one.
      disableSignUp: !signupOpen,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(user.email, "Reset your Hangar password", `Open this link to choose a new password:\n\n${url}\n\nIf you did not ask for this, ignore this message.`);
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 60, customRules: { "/sign-in/email": { window: 60, max: 10 }, "/sign-up/email": { window: 60, max: 5 }, "/request-password-reset": { window: 300, max: 3 } } },
    advanced: { defaultCookieAttributes: { sameSite: "lax", httpOnly: true } },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof create>;
const g = globalThis as unknown as { __hangarAuth?: Auth };

export async function getAuth(): Promise<Auth> {
  await readyDb();
  if (!g.__hangarAuth) g.__hangarAuth = create();
  return g.__hangarAuth;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  baseCurrency: "EUR" | "CHF" | "USD" | "GBP";
}

/**
 * Login is off unless HANGAR_AUTH=on. Without it, everyone who can reach the server is the one
 * local user. Only run it that way on your own machine, never on a public deployment.
 */
export const authEnabled = process.env.HANGAR_AUTH === "on";

/** HANGAR_SIGNUP=off closes registration (recommended for a personal deployment). */
export const signupOpen = process.env.HANGAR_SIGNUP !== "off";

const LOCAL_EMAIL = "demo@hangar.test";

/** The single owner when login is off: the demo account if seeded, else the oldest user, else a new one. */
async function localUser() {
  const db = getDb();
  const [demo] = await db.select().from(schema.user).where(eq(schema.user.email, LOCAL_EMAIL));
  if (demo) return demo;
  const [oldest] = await db.select().from(schema.user).orderBy(asc(schema.user.createdAt)).limit(1);
  if (oldest) return oldest;
  await db.insert(schema.user).values({ id: crypto.randomUUID(), name: "Collector", email: LOCAL_EMAIL, emailVerified: true }).onConflictDoNothing();
  const [created] = await db.select().from(schema.user).where(eq(schema.user.email, LOCAL_EMAIL));
  return created;
}

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  let u: { id: string; name: string; email: string } | undefined;
  if (authEnabled) {
    const auth = await getAuth();
    u = (await auth.api.getSession({ headers }))?.user;
  } else {
    await readyDb();
    u = await localUser();
  }
  if (!u) return null;
  const db = getDb();
  let [settings] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, u.id));
  if (!settings) {
    [settings] = await db.insert(schema.userSettings).values({ userId: u.id }).onConflictDoNothing().returning();
    if (!settings) [settings] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, u.id));
  }
  const envAdmin = (process.env.ADMIN_EMAILS ?? "").split(",").map((x) => x.trim().toLowerCase()).includes(u.email.toLowerCase());
  return { id: u.id, name: u.name, email: u.email, isAdmin: settings.isAdmin || envAdmin, baseCurrency: settings.baseCurrency };
}

