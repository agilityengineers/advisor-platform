CREATE TABLE "platform_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"linkedin" text DEFAULT '' NOT NULL,
	"intent" text DEFAULT 'demo' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"converted_company_id" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_leads_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "platform_leads" ADD CONSTRAINT "platform_leads_converted_company_id_companies_id_fk" FOREIGN KEY ("converted_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_platform_leads_status" ON "platform_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_platform_leads_email" ON "platform_leads" USING btree ("email");