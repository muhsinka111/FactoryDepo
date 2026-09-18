-- Remove the throwaway rows the integration suite leaves behind.
--
-- Why this file exists: AGENTS.md asks for a cleanup after a local run, and the
-- dependency order is not obvious — `shipments` and `payments` reference
-- `orders`, so deleting orders first fails with a foreign-key error and rolls the
-- whole transaction back.
--
-- Run it after TEST_BASE_URL runs of the suite:
--   "/c/Program Files/PostgreSQL/16/bin/psql.exe" -h localhost -U postgres \
--     -d factorydepo -v ON_ERROR_STOP=1 -f scripts/cleanup-test-rows.sql
--
-- Safe to re-run: it only ever touches accounts at *@factorydepo.test.
BEGIN;

CREATE TEMP TABLE t_users AS
  SELECT id FROM users WHERE email LIKE '%@factorydepo.test';
CREATE TEMP TABLE t_suppliers AS
  SELECT id FROM suppliers WHERE "userId" IN (SELECT id FROM t_users);
CREATE TEMP TABLE t_products AS
  SELECT id FROM products WHERE "supplierId" IN (SELECT id FROM t_suppliers);
CREATE TEMP TABLE t_orders AS
  SELECT id FROM orders WHERE "productId" IN (SELECT id FROM t_products)
  UNION
  SELECT id FROM orders WHERE "buyerId" IN (SELECT id FROM t_users);

DELETE FROM shipments    WHERE "orderId" IN (SELECT id FROM t_orders);
DELETE FROM payments      WHERE "orderId" IN (SELECT id FROM t_orders);
DELETE FROM messages      WHERE "threadId" IN (SELECT id FROM threads WHERE "buyerId" IN (SELECT id FROM t_users));
DELETE FROM threads       WHERE "buyerId" IN (SELECT id FROM t_users);
DELETE FROM notifications WHERE "userId" IN (SELECT id FROM t_users);
DELETE FROM product_views WHERE "productId" IN (SELECT id FROM t_products);
DELETE FROM saved_lots    WHERE "productId" IN (SELECT id FROM t_products);
DELETE FROM offers        WHERE "productId" IN (SELECT id FROM t_products);
DELETE FROM orders        WHERE id IN (SELECT id FROM t_orders);
DELETE FROM products      WHERE id IN (SELECT id FROM t_products);
DELETE FROM quotes        WHERE "supplierId" IN (SELECT id FROM t_suppliers);
DELETE FROM rfqs          WHERE "buyerId" IN (SELECT id FROM t_users);
DELETE FROM suppliers     WHERE id IN (SELECT id FROM t_suppliers);
DELETE FROM users         WHERE id IN (SELECT id FROM t_users);

-- Both must come back 0 before you treat the catalogue as clean.
SELECT count(*) AS leftover_test_users  FROM users    WHERE email LIKE '%@factorydepo.test';
SELECT count(*) AS non_demo_listings    FROM products WHERE "dataSource" <> 'demo';

COMMIT;