import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());

/* ───────────── Auth (Better Auth core tables) ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ───────────── Reference data ───────────── */

export const airlines = pgTable(
  "airlines",
  {
    id: id(),
    name: text("name").notNull(),
    iata: text("iata"),
    icao: text("icao"),
    country: text("country"), // ISO alpha-2 home country
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    logoUrl: text("logo_url"),
    defunct: boolean("defunct").notNull().default(false),
  },
  (t) => [uniqueIndex("airlines_name_uq").on(t.name)],
);

export const aircraftTypes = pgTable(
  "aircraft_types",
  {
    id: id(),
    manufacturer: text("manufacturer").notNull(),
    family: text("family").notNull(),
    variant: text("variant").notNull(),
    icaoCode: text("icao_code"),
    shape: text("shape").notNull().default("narrow"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    uniqueIndex("aircraft_types_variant_uq").on(t.manufacturer, t.variant),
    index("aircraft_types_icao_idx").on(t.icaoCode),
  ],
);

export const modelManufacturers = pgTable(
  "model_manufacturers",
  {
    id: id(),
    name: text("name").notNull(),
    website: text("website"),
    logoUrl: text("logo_url"),
    // null = shared list, otherwise added privately by this user.
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("model_mfr_shared_uq").on(t.name).where(sql`owner_id is null`),
    uniqueIndex("model_mfr_owner_uq").on(t.ownerId, t.name),
  ],
);

/* ───────────── Global catalog ───────────── */

export const liveryCategory = pgEnum("livery_category", [
  "standard",
  "retro",
  "anniversary",
  "special",
  "alliance",
  "promotional",
  "hybrid",
  "other",
]);

export const releaseStatus = pgEnum("release_status", ["unverified", "verified", "rejected", "merged"]);

export const modelReleases = pgTable(
  "model_releases",
  {
    id: id(),
    airlineId: text("airline_id").references(() => airlines.id, { onDelete: "set null" }),
    airlineName: text("airline_name"),
    aircraftTypeId: text("aircraft_type_id").references(() => aircraftTypes.id, { onDelete: "set null" }),
    aircraftName: text("aircraft_name").notNull(),
    modelManufacturerId: text("model_manufacturer_id").references(() => modelManufacturers.id, {
      onDelete: "set null",
    }),
    modelManufacturerName: text("model_manufacturer_name").notNull(),
    scale: text("scale"),
    registration: text("registration"),
    itemNumber: text("item_number"),
    barcode: text("barcode"),
    liveryCategory: liveryCategory("livery_category"),
    liveryName: text("livery_name"),
    releaseYear: integer("release_year"),
    status: releaseStatus("status").notNull().default("unverified"),
    sourceUrl: text("source_url"),
    submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
    mergedInto: text("merged_into"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("releases_item_idx").on(t.itemNumber),
    index("releases_barcode_idx").on(t.barcode),
    index("releases_status_idx").on(t.status),
    index("releases_reg_idx").on(t.registration),
  ],
);

export const catalogReports = pgTable(
  "catalog_reports",
  {
    id: id(),
    releaseId: text("release_id")
      .notNull()
      .references(() => modelReleases.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("catalog_reports_release_idx").on(t.releaseId)],
);

/* ───────────── Personal collection ───────────── */

export const itemStatus = pgEnum("item_status", ["collection", "wishlist", "ordered", "preordered", "sold"]);
export const currency = pgEnum("currency", ["EUR", "CHF", "USD", "GBP"]);
export const itemCondition = pgEnum("item_condition", ["mint", "very_good", "good", "fair", "damaged"]);
export const boxStatus = pgEnum("box_status", ["with_box", "damaged_box", "no_box"]);

/**
 * One physical (or wished-for) copy. Collection and wishlist share one table because a model moves
 * between those states and must keep all of its data. Descriptive fields are snapshots: a user can
 * correct them without touching the shared catalog, and no catalog release is required.
 */
export const items = pgTable(
  "items",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    releaseId: text("release_id").references(() => modelReleases.id, { onDelete: "set null" }),
    status: itemStatus("status").notNull().default("collection"),

    airlineId: text("airline_id").references(() => airlines.id, { onDelete: "set null" }),
    airlineName: text("airline_name"),
    aircraftTypeId: text("aircraft_type_id").references(() => aircraftTypes.id, { onDelete: "set null" }),
    aircraftName: text("aircraft_name").notNull(),
    modelManufacturerName: text("model_manufacturer_name").notNull(),
    scale: text("scale"),
    registration: text("registration"),
    itemNumber: text("item_number"),
    /** EAN / UPC printed on the box, for duplicate checks by scanning. */
    barcode: text("barcode"),
    liveryCategory: liveryCategory("livery_category"),
    liveryName: text("livery_name"),
    countryCode: text("country_code"),
    registrationCountry: text("registration_country"),

    // Money is stored as integer minor units in its original currency.
    purchasePriceCents: integer("purchase_price_cents"),
    purchaseCurrency: currency("purchase_currency"),
    purchaseDate: date("purchase_date"),
    valueCents: integer("value_cents"),
    valueCurrency: currency("value_currency"),
    valueDate: date("value_date"),
    valueSource: text("value_source"),

    condition: itemCondition("condition"),
    boxStatus: boxStatus("box_status"),
    limitedEdition: boolean("limited_edition"),
    certificate: boolean("certificate"),
    storageLocation: text("storage_location"),
    purchaseSource: text("purchase_source"),
    rating: integer("rating"),
    notes: text("notes"),

    priority: integer("priority"),
    desiredPriceCents: integer("desired_price_cents"),
    desiredCurrency: currency("desired_currency"),
    expectedRelease: date("expected_release"),
    dealer: text("dealer"),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("items_user_status_idx").on(t.userId, t.status),
    index("items_user_release_idx").on(t.userId, t.releaseId),
    index("items_user_item_no_idx").on(t.userId, t.itemNumber),
    index("items_user_barcode_idx").on(t.userId, t.barcode),
    index("items_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const valueHistory = pgTable(
  "value_history",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cents: integer("cents").notNull(),
    currency: currency("currency").notNull(),
    date: date("date").notNull(),
    source: text("source"),
    createdAt: createdAt(),
  },
  (t) => [index("value_history_item_idx").on(t.itemId), index("value_history_user_idx").on(t.userId, t.date)],
);

export const modelImages = pgTable(
  "model_images",
  {
    id: id(),
    // Exactly one parent: a personal item (private) or a catalog release (shared).
    itemId: text("item_id").references(() => items.id, { onDelete: "cascade" }),
    releaseId: text("release_id").references(() => modelReleases.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    source: text("source"),
    usagePermission: text("usage_permission"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("model_images_item_idx").on(t.itemId, t.position), index("model_images_release_idx").on(t.releaseId)],
);

/* ───────────── Settings, sharing, FX ───────────── */

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  baseCurrency: currency("base_currency").notNull().default("EUR"),
  isAdmin: boolean("is_admin").notNull().default(false),
  updatedAt: updatedAt(),
});

export const shareLinks = pgTable("share_links", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  title: text("title"),
  // Sensitive fields are opt-in; the defaults keep them private.
  showPrices: boolean("show_prices").notNull().default(false),
  showValues: boolean("show_values").notNull().default(false),
  showDates: boolean("show_dates").notNull().default(false),
  showNotes: boolean("show_notes").notNull().default(false),
  showStorage: boolean("show_storage").notNull().default(false),
  updatedAt: updatedAt(),
});

export const fxRates = pgTable("fx_rates", {
  base: text("base").primaryKey(),
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  rateDate: date("rate_date").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small key/value store for the app itself, e.g. which version of the reference data is seeded. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

/* ───────────── Market prices ───────────── */

export interface MarketListing { title: string; cents: number; currency: string; url: string; image: string | null; condition: string | null }

/**
 * One day's look at the open market for a model: matching listings and their median, in EUR.
 * These are asking prices from current offers, not sold prices, so they are a guide, not a valuation.
 * Kept daily so the app builds its own price history over time.
 */
export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    date: date("date").notNull(),
    query: text("query").notNull(),
    exact: boolean("exact").notNull().default(false),
    count: integer("count").notNull(),
    medianCents: integer("median_cents"),
    lowCents: integer("low_cents"),
    highCents: integer("high_cents"),
    currency: currency("currency").notNull().default("EUR"),
    listings: jsonb("listings").$type<MarketListing[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("market_item_day_uq").on(t.itemId, t.source, t.date), index("market_user_idx").on(t.userId, t.date)],
);
