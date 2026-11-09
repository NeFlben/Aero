import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { AIRCRAFT_TYPES, AIRLINE_RENAMES, AIRLINES, MODEL_MANUFACTURERS } from "@/data/reference";

export type Db = PgliteDatabase<typeof schema>;

type Holder = { db: Db; ready: Promise<void>; close: () => Promise<void> };
const g = globalThis as unknown as { __hangarDb?: Holder };

/**
 * DATABASE_URL set  → regular PostgreSQL (production).
 * DATABASE_URL empty → PGlite, a real Postgres compiled to WASM, stored in a local folder.
 * Both run the same migrations, so moving to hosted Postgres needs no code change.
 */
function open(): Holder {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;

  if (url) {
    // Serverless functions each hold their own pool, so it stays small there. prepare: false keeps
    // the client compatible with transaction-mode poolers such as Neon's "-pooler" endpoint.
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX) || (process.env.VERCEL ? 3 : 10), prepare: false, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    return {
      db: db as unknown as Db,
      ready: migratePostgres(db, { migrationsFolder }).then(() => seedReference(db as unknown as Db)),
      close: () => client.end(),
    };
  }

  const dir = process.env.PGLITE_DATA_DIR ?? ".data/pg";
  const memory = dir === "memory://";
  if (!memory) fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(memory ? undefined : dir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    ready: client.waitReady.then(() => migratePglite(db, { migrationsFolder })).then(() => seedReference(db)),
    close: () => client.close(),
  };
}

function holder(): Holder {
  if (!g.__hangarDb) g.__hangarDb = open();
  return g.__hangarDb;
}

export function getDb(): Db {
  return holder().db;
}

/** Await before the first query of a request. Resolves immediately after boot. */
export async function readyDb(): Promise<Db> {
  const h = holder();
  await h.ready;
  return h.db;
}

export async function closeDb() {
  if (g.__hangarDb) {
    await g.__hangarDb.close();
    g.__hangarDb = undefined;
  }
}

const REFERENCE_KEY = "reference_version";
/** Fingerprint of the shipped reference lists: seeding runs only when they changed since the last boot. */
const referenceVersion = () =>
  createHash("sha256").update(JSON.stringify([AIRLINE_RENAMES, AIRLINES, AIRCRAFT_TYPES, MODEL_MANUFACTURERS])).digest("hex").slice(0, 16);

/**
 * Idempotent upsert: shipped reference data is corrected on boot, user data is untouched. Skipped
 * when the same version is already seeded, which keeps cold starts fast on serverless hosting.
 */
async function seedReference(db: Db) {
  const version = referenceVersion();
  const [seeded] = await db.select({ value: schema.appMeta.value }).from(schema.appMeta).where(eq(schema.appMeta.key, REFERENCE_KEY));
  if (seeded?.value === version) return;
  await seedReferenceLists(db);
  await db
    .insert(schema.appMeta)
    .values({ key: REFERENCE_KEY, value: version })
    .onConflictDoUpdate({ target: schema.appMeta.key, set: { value: version, updatedAt: new Date() } });
}

async function seedReferenceLists(db: Db) {
  // Renamed reference airlines keep their row (and every model linked to it) instead of getting a twin.
  for (const [from, to] of AIRLINE_RENAMES) {
    await db.execute(sql`update airlines set name = ${to} where name = ${from} and not exists (select 1 from airlines where name = ${to})`);
  }
    await db
    .insert(schema.airlines)
    .values(
      AIRLINES.map(([name, iata, icao, country, aliases, defunct]) => ({
          name,
          iata,
          icao,
          country,
          aliases: aliases ?? [],
          defunct: defunct ?? false,
        })),
    )
    .onConflictDoUpdate({
      target: schema.airlines.name,
      set: {
        iata: sql`excluded.iata`,
        icao: sql`excluded.icao`,
        country: sql`excluded.country`,
        aliases: sql`excluded.aliases`,
        defunct: sql`excluded.defunct`,
      },
    });
  await db
    .insert(schema.aircraftTypes)
    .values(
      AIRCRAFT_TYPES.map(([manufacturer, family, variant, icaoCode, shape, aliases]) => ({
        manufacturer,
        family,
        variant,
        icaoCode,
        shape,
        aliases: aliases ?? [],
      })),
    )
    .onConflictDoUpdate({
      target: [schema.aircraftTypes.manufacturer, schema.aircraftTypes.variant],
      set: {
        family: sql`excluded.family`,
        icaoCode: sql`excluded.icao_code`,
        shape: sql`excluded.shape`,
        aliases: sql`excluded.aliases`,
      },
    });
  for (const [name, website] of MODEL_MANUFACTURERS) {
    await db.execute(
      sql`insert into model_manufacturers (id, name, website) values (${crypto.randomUUID()}, ${name}, ${website})
          on conflict (name) where owner_id is null do nothing`,
    );
  }
}
