ALTER TABLE "order_installments" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_installments" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Fulfilment used to race (return page vs webhook) and could schedule an order's installments twice.
-- Keep one row per (order, seq) — a paid one if any, else the earliest — before adding the unique index.
DELETE FROM "order_installments" a USING "order_installments" b
WHERE a."order_id" = b."order_id" AND a."seq" = b."seq" AND a."id" <> b."id"
  AND ((b."status" = 'paid' AND a."status" <> 'paid') OR (a."status" = b."status" AND a."id" > b."id") OR (a."status" <> 'paid' AND b."status" <> 'paid' AND a."id" > b."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_installments_order_seq" ON "order_installments" USING btree ("order_id","seq");--> statement-breakpoint
CREATE INDEX "idx_order_installments_pi" ON "order_installments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_orders_stripe_pi" ON "orders" USING btree ("stripe_payment_intent_id");