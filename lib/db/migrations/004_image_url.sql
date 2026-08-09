-- 004: store the source product image URL from Alibaba scrapes (nullable).
ALTER TABLE products ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
