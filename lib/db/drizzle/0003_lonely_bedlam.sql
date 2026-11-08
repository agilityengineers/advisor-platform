ALTER TABLE "bookings" ADD COLUMN "confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "prep_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "order_installments" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "order_installments" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_installments" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "intake_reminder_at" timestamp;