CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"s3_key" text NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;