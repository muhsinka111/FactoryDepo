-- scripts/purge-demo.sql — remove every demo row from the catalogue.
--
-- Why a script and not "delete from products": the demo catalogue is the seed's
-- and the old import pipeline's data, and it owns rows in nine other tables. The
-- order below follows the foreign keys that block a delete (they have no ON
-- DELETE rule), so the purge is one transaction instead of a series of errors.
--
-- Deleted: rows with dataSource='demo' (products, suppliers, rfqs), everything
-- hanging off them, and the demo ACCOUNTS — the seed's logins (published
-- passwords, which must never exist on a live site) plus the '@import.local'
-- sellers of the imported catalogue.
-- Kept: every row a real seller created (dataSource='platform'), the owner's
-- accounts, real orders/invoices, and the audit trail of real actions.
--
-- Idempotent: running it twice deletes nothing the second time.
--   psql "$DATABASE_URL" -f scripts/purge-demo.sql

BEGIN;

CREATE TEMP TABLE demo_u ON COMMIT DROP AS
SELECT id FROM users
 WHERE email LIKE '%@import.local'
    OR email IN (
      'demo@factorydepo.com', 'buyer@factorydepo.com', 'supplier@factorydepo.com', 'inspector@factorydepo.com',
      'berlin@industries.de', 'berlin@praezision.de', 'brescia@castings.it', 'bursa@aluminum.com.tr',
      'foshan@steel.cn', 'gulf@sourcing.sa', 'iberia@minerals.es', 'istanbul@chemicals.com.tr',
      'jiangsu@xihua.cn', 'krakow@packaging.pl', 'ningbo@solar.cn', 'shandong@mining.cn',
      'zhejiang@chemtech.cn'
    );

CREATE TEMP TABLE demo_s ON COMMIT DROP AS
SELECT id FROM suppliers WHERE "dataSource" = 'demo' OR "userId" IN (SELECT id FROM demo_u);

CREATE TEMP TABLE demo_p ON COMMIT DROP AS
SELECT id FROM products WHERE "dataSource" = 'demo' OR "supplierId" IN (SELECT id FROM demo_s);

CREATE TEMP TABLE demo_o ON COMMIT DROP AS
SELECT id FROM orders
 WHERE "productId" IN (SELECT id FROM demo_p)
    OR "supplierId" IN (SELECT id FROM demo_s)
    OR "buyerId" IN (SELECT id FROM demo_u);

CREATE TEMP TABLE demo_r ON COMMIT DROP AS
SELECT id FROM rfqs WHERE "dataSource" = 'demo' OR "buyerId" IN (SELECT id FROM demo_u);

-- threads are selected up front because their messages must go first: the
-- messages.threadId foreign key has no delete rule, so the delete order matters.
CREATE TEMP TABLE demo_t ON COMMIT DROP AS
SELECT id FROM threads
 WHERE "productId" IN (SELECT id FROM demo_p)
    OR "supplierId" IN (SELECT id FROM demo_s)
    OR "buyerId" IN (SELECT id FROM demo_u);

-- 1. what hangs off orders and rfqs
DELETE FROM payments  WHERE "orderId" IN (SELECT id FROM demo_o);
DELETE FROM shipments WHERE "orderId" IN (SELECT id FROM demo_o);
DELETE FROM orders    WHERE id IN (SELECT id FROM demo_o);
DELETE FROM quotes    WHERE "rfqId" IN (SELECT id FROM demo_r) OR "supplierId" IN (SELECT id FROM demo_s);
DELETE FROM rfqs      WHERE id IN (SELECT id FROM demo_r);

-- 2. what hangs off the demo listings and sellers
DELETE FROM offers            WHERE "productId" IN (SELECT id FROM demo_p) OR "supplierId" IN (SELECT id FROM demo_s) OR "buyerId" IN (SELECT id FROM demo_u);
DELETE FROM saved_lots        WHERE "productId" IN (SELECT id FROM demo_p) OR "userId" IN (SELECT id FROM demo_u);
DELETE FROM product_views     WHERE "productId" IN (SELECT id FROM demo_p) OR "userId" IN (SELECT id FROM demo_u);
DELETE FROM product_questions WHERE "productId" IN (SELECT id FROM demo_p) OR "askerId" IN (SELECT id FROM demo_u) OR "answeredById" IN (SELECT id FROM demo_u);
DELETE FROM messages          WHERE "threadId" IN (SELECT id FROM demo_t) OR "senderId" IN (SELECT id FROM demo_u);
DELETE FROM threads           WHERE id IN (SELECT id FROM demo_t);
DELETE FROM inspections       WHERE "supplierId" IN (SELECT id FROM demo_s) OR "inspectorId" IN (SELECT id FROM demo_u);
DELETE FROM supplier_docs     WHERE "supplierId" IN (SELECT id FROM demo_s);

-- 3. what hangs off the demo accounts (a real row keeps its record, losing only
--    the demo actor that touched it)
UPDATE suppliers      SET "attestedBy" = NULL WHERE "attestedBy" IN (SELECT id FROM demo_u);
UPDATE supplier_docs  SET "reviewedBy" = NULL WHERE "reviewedBy" IN (SELECT id FROM demo_u);
UPDATE payments       SET "confirmedBy" = NULL WHERE "confirmedBy" IN (SELECT id FROM demo_u);
UPDATE product_questions SET "answeredById" = NULL WHERE "answeredById" IN (SELECT id FROM demo_u);
DELETE FROM notifications   WHERE "userId" IN (SELECT id FROM demo_u);
DELETE FROM support_tickets WHERE "userId" IN (SELECT id FROM demo_u);
DELETE FROM media           WHERE "ownerUserId" IN (SELECT id FROM demo_u);
DELETE FROM admin_audit     WHERE "adminUserId" IN (SELECT id FROM demo_u);

-- 4. the catalogue itself
DELETE FROM products  WHERE id IN (SELECT id FROM demo_p);
DELETE FROM suppliers WHERE id IN (SELECT id FROM demo_s);
DELETE FROM users     WHERE id IN (SELECT id FROM demo_u);

COMMIT;

-- What is left — the honest state of the catalogue.
SELECT (SELECT count(*) FROM products)  AS products,
       (SELECT count(*) FROM products  WHERE "dataSource" <> 'demo') AS real_listings,
       (SELECT count(*) FROM suppliers) AS suppliers,
       (SELECT count(*) FROM users)     AS users,
       (SELECT count(*) FROM rfqs)      AS rfqs;
