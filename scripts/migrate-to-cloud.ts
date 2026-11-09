/**
 * Moves the local Hangar (PGlite in PGLITE_DATA_DIR, photos in UPLOAD_DIR) to hosted PostgreSQL and
 * a private Vercel Blob store, and gives the collection's owner an email + password for the login.
 *
 * Stop the dev server and Hangar.exe first (PGlite allows one process). Then, in PowerShell:
 *
 *   $env:TARGET_DATABASE_URL="postgres://…"      # Neon connection string
 *   $env:OWNER_EMAIL="you@example.com"; $env:OWNER_PASSWORD="…"  # your future login
 *   $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_…"  # from the Vercel Blob store
 *   npx tsx scripts/migrate-to-cloud.ts
 *
 * Safe to run again: rows that already exist are skipped, photos already in the bucket are not re-sent.
 * The local data is only read (plus pending migrations), never deleted.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { head, put } from "@vercel/blob";
import { hashPassword } from "better-auth/crypto";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Parent tables before children. Sessions and verification tokens are device-bound and stay behind. */
const TABLES = [
  "user", "account", "airlines", "aircraft_types", "model_manufacturers", "model_releases", "catalog_reports",
  "items", "value_history", "model_images", "user_settings", "share_links", "fx_rates", "market_snapshots",
];

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const target = process.env.TARGET_DATABASE_URL;
  if (!target) fail("TARGET_DATABASE_URL is missing (the connection string of the hosted database).");
  const force = process.argv.includes("--force");
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  const srcDir = process.env.PGLITE_DATA_DIR ?? ".data/pg";
  if (!fs.existsSync(srcDir)) fail(`No local database at ${srcDir}.`);
  console.log(`• Local database: ${srcDir}`);
  const src = new PGlite(srcDir);
  await src.waitReady;
  // Same schema on both sides, so every column copies 1:1.
  await migratePglite(drizzlePglite(src), { migrationsFolder });

  const dst = postgres(target, { max: 1, onnotice: () => {} });
  await migratePostgres(drizzlePostgres(dst), { migrationsFolder });
  console.log("• Hosted database: schema is up to date");

  const [{ n: existing }] = await dst`select count(*)::int as n from items`;
  if (existing > 0 && !force) fail(`The hosted database already has ${existing} models. Run again with --force to add only what is missing.`);

  for (const table of TABLES) {
    const { rows } = await src.query<Record<string, unknown>>(`select * from "${table}"`);
    // Values go over as text and Postgres casts them by the column type, so dates, jsonb and arrays survive as they are.
    const cols = await dst<{ column_name: string; data_type: string }[]>`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = ${table}`;
    const kind = new Map(cols.map((c) => [c.column_name, c.data_type]));
    const toText = (col: string, v: unknown): string | number | boolean | null => {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      const type = kind.get(col);
      if (type === "jsonb" || type === "json") return JSON.stringify(v);
      if (type === "ARRAY" && Array.isArray(v)) return `{${v.map((x) => (x === null ? "NULL" : `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
      return v as string | number | boolean;
    };
    let copied = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => kind.has(k)).map(([k, v]) => [k, toText(k, v)])));
      const res = await dst`insert into ${dst(table)} ${dst(chunk)} on conflict do nothing`;
      copied += res.count;
    }
    console.log(`  ${table.padEnd(20)} ${String(rows.length).padStart(6)} local, ${String(copied).padStart(6)} new`);
  }

  // The owner: the account the app used without login (demo address if present, else the oldest).
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (email) {
    if (!password || password.length < 8) fail("OWNER_PASSWORD must have at least 8 characters.");
    const { rows: owners } = await src.query<{ id: string; name: string }>(
      `select id, name from "user" order by (email = 'demo@hangar.test') desc, created_at asc limit 1`,
    );
    const owner = owners[0];
    if (!owner) fail("The local database has no user.");
    const [taken] = await dst`select id from "user" where lower(email) = ${email} and id <> ${owner.id}`;
    if (taken) fail(`${email} already belongs to another account in the hosted database.`);
    const name = process.env.OWNER_NAME?.trim() || owner.name;
    await dst`update "user" set email = ${email}, name = ${name}, email_verified = true, updated_at = now() where id = ${owner.id}`;
    const hash = await hashPassword(password);
    const [acc] = await dst`select id from account where user_id = ${owner.id} and provider_id = 'credential'`;
    if (acc) await dst`update account set password = ${hash}, updated_at = now() where id = ${acc.id}`;
    else await dst`insert into account (id, account_id, provider_id, user_id, password) values (${crypto.randomUUID()}, ${owner.id}, 'credential', ${owner.id}, ${hash})`;
    console.log(`• Login set up: ${email} (owner of the collection)`);
  } else {
    console.log("• OWNER_EMAIL not set: no login was created. You can run the script again with it.");
  }
  await dst.end();
  await src.close();

  // Photos.
  const uploads = path.resolve(process.env.UPLOAD_DIR ?? ".data/uploads");
  if (!fs.existsSync(uploads)) {
    console.log("• No local photos.");
  } else if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("• BLOB_READ_WRITE_TOKEN not set: photos were not copied. Run again with it to copy them.");
  } else {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".webp")) files.push(p);
      }
    };
    walk(uploads);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const key = path.relative(uploads, f).split(path.sep).join("/");
        try {
          if (await head(key).then(() => true, () => false)) {
            skipped++;
            continue;
          }
          await put(key, fs.readFileSync(f), { access: "private", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true });
          sent++;
        } catch {
          failed++;
        }
        if ((sent + skipped + failed) % 100 === 0) console.log(`  photos ${sent + skipped + failed}/${files.length}`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    console.log(`• Photos: ${sent} uploaded, ${skipped} already there${failed ? `, ${failed} FAILED (run again)` : ""}`);
  }
  console.log("\n✔ Done.\n");
}

main().catch((e) => fail(e instanceof Error ? e.stack ?? e.message : String(e)));
