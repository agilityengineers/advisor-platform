CREATE TABLE "impersonation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"super_admin_id" integer NOT NULL,
	"target_user_id" integer NOT NULL,
	"company_id" integer,
	"reason" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"ended_reason" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE INDEX "idx_impersonation_sessions_admin" ON "impersonation_sessions" USING btree ("super_admin_id");--> statement-breakpoint
CREATE INDEX "idx_impersonation_sessions_company" ON "impersonation_sessions" USING btree ("company_id");