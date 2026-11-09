CREATE TABLE "market_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"date" date NOT NULL,
	"query" text NOT NULL,
	"exact" boolean DEFAULT false NOT NULL,
	"count" integer NOT NULL,
	"median_cents" integer,
	"low_cents" integer,
	"high_cents" integer,
	"currency" "currency" DEFAULT 'EUR' NOT NULL,
	"listings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_item_day_uq" ON "market_snapshots" USING btree ("item_id","source","date");--> statement-breakpoint
CREATE INDEX "market_user_idx" ON "market_snapshots" USING btree ("user_id","date");