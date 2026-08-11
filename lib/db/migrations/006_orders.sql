-- ============================================================================
-- 006_orders.sql — FactoryDepo dropshipping: buy-now orders
-- ----------------------------------------------------------------------------
-- Buyer clicks "Buy Now" on a product → creates an order (dropship flow).
-- Status flow: pending → paid → shipped → delivered (or cancelled).
-- Unit snapshot columns freeze the price/MOQ at order time (price edits or
-- listing removal later must not change a placed order).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "orders" (
  "id" serial PRIMARY KEY,
  "buyerId" integer NOT NULL REFERENCES "users"("id"),
  "productId" integer NOT NULL REFERENCES "products"("id"),
  "supplierId" integer NOT NULL REFERENCES "suppliers"("id"),
  "quantity" numeric(14, 2) NOT NULL CHECK ("quantity" > 0),
  "unitPrice" numeric(14, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "total" numeric(14, 2) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  "shippingName" text NOT NULL,
  "shippingAddress" text NOT NULL,
  "shippingCity" text NOT NULL,
  "shippingCountry" text NOT NULL,
  "shippingPhone" text,
  "notes" text,
  "createdAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "orders_buyerId_idx" ON "orders" ("buyerId");
CREATE INDEX IF NOT EXISTS "orders_supplierId_idx" ON "orders" ("supplierId");
CREATE INDEX IF NOT EXISTS "orders_productId_idx" ON "orders" ("productId");
