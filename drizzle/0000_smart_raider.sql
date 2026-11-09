CREATE TYPE "public"."box_status" AS ENUM('with_box', 'damaged_box', 'no_box');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('EUR', 'CHF', 'USD', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."item_condition" AS ENUM('mint', 'very_good', 'good', 'fair', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('collection', 'wishlist', 'ordered', 'preordered', 'sold');--> statement-breakpoint
CREATE TYPE "public"."livery_category" AS ENUM('standard', 'retro', 'anniversary', 'special', 'alliance', 'promotional', 'hybrid', 'other');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('unverified', 'verified', 'rejected', 'merged');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aircraft_types" (
	"id" text PRIMARY KEY NOT NULL,
	"manufacturer" text NOT NULL,
	"family" text NOT NULL,
	"variant" text NOT NULL,
	"icao_code" text,
	"shape" text DEFAULT 'narrow' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airlines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"iata" text,
	"icao" text,
	"country" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"logo_url" text,
	"defunct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	"user_id" text,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"base" text PRIMARY KEY NOT NULL,
	"rates" jsonb NOT NULL,
	"rate_date" date NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"release_id" text,
	"status" "item_status" DEFAULT 'collection' NOT NULL,
	"airline_id" text,
	"airline_name" text,
	"aircraft_type_id" text,
	"aircraft_name" text NOT NULL,
	"model_manufacturer_name" text NOT NULL,
	"scale" text,
	"registration" text,
	"item_number" text,
	"livery_category" "livery_category",
	"livery_name" text,
	"country_code" text,
	"registration_country" text,
	"purchase_price_cents" integer,
	"purchase_currency" "currency",
	"purchase_date" date,
	"value_cents" integer,
	"value_currency" "currency",
	"value_date" date,
	"value_source" text,
	"condition" "item_condition",
	"box_status" "box_status",
	"limited_edition" boolean,
	"certificate" boolean,
	"storage_location" text,
	"purchase_source" text,
	"rating" integer,
	"notes" text,
	"priority" integer,
	"desired_price_cents" integer,
	"desired_currency" "currency",
	"expected_release" date,
	"dealer" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_images" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text,
	"release_id" text,
	"user_id" text,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"source" text,
	"usage_permission" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_manufacturers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"logo_url" text,
	"owner_id" text
);
--> statement-breakpoint
CREATE TABLE "model_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"airline_id" text,
	"airline_name" text,
	"aircraft_type_id" text,
	"aircraft_name" text NOT NULL,
	"model_manufacturer_id" text,
	"model_manufacturer_name" text NOT NULL,
	"scale" text,
	"registration" text,
	"item_number" text,
	"barcode" text,
	"livery_category" "livery_category",
	"livery_name" text,
	"release_year" integer,
	"status" "release_status" DEFAULT 'unverified' NOT NULL,
	"source_url" text,
	"submitted_by" text,
	"merged_into" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"title" text,
	"show_prices" boolean DEFAULT false NOT NULL,
	"show_values" boolean DEFAULT false NOT NULL,
	"show_dates" boolean DEFAULT false NOT NULL,
	"show_notes" boolean DEFAULT false NOT NULL,
	"show_storage" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"base_currency" "currency" DEFAULT 'EUR' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "value_history" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cents" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"date" date NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_reports" ADD CONSTRAINT "catalog_reports_release_id_model_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."model_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_reports" ADD CONSTRAINT "catalog_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_release_id_model_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."model_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_airline_id_airlines_id_fk" FOREIGN KEY ("airline_id") REFERENCES "public"."airlines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_aircraft_type_id_aircraft_types_id_fk" FOREIGN KEY ("aircraft_type_id") REFERENCES "public"."aircraft_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_images" ADD CONSTRAINT "model_images_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_images" ADD CONSTRAINT "model_images_release_id_model_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."model_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_images" ADD CONSTRAINT "model_images_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_manufacturers" ADD CONSTRAINT "model_manufacturers_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_releases" ADD CONSTRAINT "model_releases_airline_id_airlines_id_fk" FOREIGN KEY ("airline_id") REFERENCES "public"."airlines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_releases" ADD CONSTRAINT "model_releases_aircraft_type_id_aircraft_types_id_fk" FOREIGN KEY ("aircraft_type_id") REFERENCES "public"."aircraft_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_releases" ADD CONSTRAINT "model_releases_model_manufacturer_id_model_manufacturers_id_fk" FOREIGN KEY ("model_manufacturer_id") REFERENCES "public"."model_manufacturers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_releases" ADD CONSTRAINT "model_releases_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_history" ADD CONSTRAINT "value_history_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_history" ADD CONSTRAINT "value_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aircraft_types_variant_uq" ON "aircraft_types" USING btree ("manufacturer","variant");--> statement-breakpoint
CREATE INDEX "aircraft_types_icao_idx" ON "aircraft_types" USING btree ("icao_code");--> statement-breakpoint
CREATE UNIQUE INDEX "airlines_name_uq" ON "airlines" USING btree ("name");--> statement-breakpoint
CREATE INDEX "catalog_reports_release_idx" ON "catalog_reports" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "items_user_status_idx" ON "items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "items_user_release_idx" ON "items" USING btree ("user_id","release_id");--> statement-breakpoint
CREATE INDEX "items_user_item_no_idx" ON "items" USING btree ("user_id","item_number");--> statement-breakpoint
CREATE INDEX "items_user_created_idx" ON "items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "model_images_item_idx" ON "model_images" USING btree ("item_id","position");--> statement-breakpoint
CREATE INDEX "model_images_release_idx" ON "model_images" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_mfr_shared_uq" ON "model_manufacturers" USING btree ("name") WHERE owner_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "model_mfr_owner_uq" ON "model_manufacturers" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "releases_item_idx" ON "model_releases" USING btree ("item_number");--> statement-breakpoint
CREATE INDEX "releases_barcode_idx" ON "model_releases" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "releases_status_idx" ON "model_releases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "releases_reg_idx" ON "model_releases" USING btree ("registration");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "value_history_item_idx" ON "value_history" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "value_history_user_idx" ON "value_history" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");