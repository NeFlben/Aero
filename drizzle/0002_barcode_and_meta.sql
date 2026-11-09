CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "barcode" text;--> statement-breakpoint
CREATE INDEX "items_user_barcode_idx" ON "items" USING btree ("user_id","barcode");