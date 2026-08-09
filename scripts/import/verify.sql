SELECT 'by_country=' || "originCountry" || ':' || count(*) FROM products GROUP BY "originCountry" ORDER BY count(*) DESC LIMIT 6;
SELECT 'cat=' || category || ':' || count(*) FROM products GROUP BY category ORDER BY count(*) DESC LIMIT 12;
SELECT 'supplier_country=' || country || ':' || count(*) FROM suppliers GROUP BY country ORDER BY count(*) DESC LIMIT 6;
SELECT 'total_products=' || count(*) FROM products;
SELECT 'total_suppliers=' || count(*) FROM suppliers;
