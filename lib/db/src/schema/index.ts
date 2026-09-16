import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * FactoryDepo core schema — 6 tables.
 *
 * Enum-like columns are plain TEXT with CHECK constraints enforced by the raw
 * boot migration (migrations/001_init.sql). No pgEnum here so the schema stays
 * in sync with hand-written SQL.
 */

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  name: text('name').notNull(),
  // buyer | supplier | inspector | lab | logistics | admin
  role: text('role').notNull().default('buyer'),
  company: text('company'),
  country: text('country'),
  lang: text('lang').default('en'),
  trustScore: numeric('trustScore', { precision: 5, scale: 2 }).default('0'),
  emailVerified: boolean('emailVerified').default(false),
  tokenVersion: integer('tokenVersion').notNull().default(0),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  userId: integer('userId')
    .notNull()
    .unique()
    .references(() => users.id),
  companyName: text('companyName').notNull(),
  country: text('country').notNull(),
  city: text('city'),
  description: text('description'),
  verifiedLevel: integer('verifiedLevel').default(0),
  rating: numeric('rating', { precision: 2, scale: 1 }).default('0'),
  inspectionsCount: integer('inspectionsCount').default(0),
  fulfillmentRate: numeric('fulfillmentRate', { precision: 5, scale: 1 }).default('0'),
  tags: jsonb('tags').default([]),
  since: integer('since'),
  contactEmail: text('contactEmail'),
  contactPhone: text('contactPhone'),
  website: text('website'),
  source: text('source'),
  // platform (real listing) | demo (bootstrap seed data)
  dataSource: text('dataSource').notNull().default('platform'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  spec: jsonb('spec').default([]),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  unit: text('unit').notNull(),
  moq: numeric('moq', { precision: 14, scale: 2 }).notNull(),
  originCountry: text('originCountry').notNull(),
  purityGrade: text('purityGrade'),
  verified: boolean('verified').default(false),
  imageKey: text('imageKey'),
  quantityAvailable: numeric('quantityAvailable', { precision: 14, scale: 2 }).notNull().default('0'),
  // active | sold_out
  status: text('status').notNull().default('active'),
  // platform (real listing) | demo (bootstrap seed data)
  dataSource: text('dataSource').notNull().default('platform'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const rfqs = pgTable('rfqs', {
  id: serial('id').primaryKey(),
  buyerId: integer('buyerId')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  unit: text('unit').notNull(),
  targetCountry: text('targetCountry'),
  // open | quoted | closed
  status: text('status').default('open'),
  deadline: timestamp('deadline', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const quotes = pgTable('quotes', {
  id: serial('id').primaryKey(),
  rfqId: integer('rfqId')
    .notNull()
    .references(() => rfqs.id),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  leadTimeDays: integer('leadTimeDays').notNull(),
  notes: text('notes'),
  // submitted | accepted | rejected
  status: text('status').default('submitted'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const inspections = pgTable('inspections', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  inspectorId: integer('inspectorId').references(() => users.id),
  // facility_audit | production_line | lab_test | pre_shipment
  type: text('type').notNull(),
  // scheduled | in_progress | passed | failed
  status: text('status').default('scheduled'),
  score: integer('score'),
  scheduledAt: timestamp('scheduledAt', { withTimezone: true, mode: 'date' }),
  completedAt: timestamp('completedAt', { withTimezone: true, mode: 'date' }),
  reportUrl: text('reportUrl'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  buyerId: integer('buyerId')
    .notNull()
    .references(() => users.id),
  productId: integer('productId')
    .notNull()
    .references(() => products.id),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  unitPrice: numeric('unitPrice', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  // pending | paid | shipped | delivered | cancelled
  status: text('status').default('pending'),
  shippingName: text('shippingName').notNull(),
  shippingAddress: text('shippingAddress').notNull(),
  shippingCity: text('shippingCity').notNull(),
  shippingCountry: text('shippingCountry').notNull(),
  shippingPhone: text('shippingPhone'),
  notes: text('notes'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

// ---------- Types ----------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Rfq = typeof rfqs.$inferSelect;
export type NewRfq = typeof rfqs.$inferInsert;

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;

export type Inspection = typeof inspections.$inferSelect;
export type NewInspection = typeof inspections.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
