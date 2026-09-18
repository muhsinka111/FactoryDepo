import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * FactoryDepo schema — 21 tables.
 *
 * Core marketplace tables (users, suppliers, products, rfqs, quotes,
 * inspections, orders) come from migrations/001_init.sql…008; the platform
 * tables the three role dashboards need (offers, threads, messages,
 * saved_lots, shipments, notifications, supplier_docs, feature_flags, banners,
 * faqs, support_tickets, product_views, payments, email_outbox) come from
 * migrations/009_platform_tables.sql.
 *
 * Enum-like columns are plain TEXT with CHECK constraints enforced by the raw
 * boot migrations. No pgEnum here so the schema stays in sync with
 * hand-written SQL.
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
  // Password reset / email verification (009): both tokens carry an expiry so a
  // leaked token is not valid forever.
  passwordResetToken: text('passwordResetToken'),
  passwordResetExpires: timestamp('passwordResetExpires', { withTimezone: true, mode: 'date' }),
  emailVerifyToken: text('emailVerifyToken'),
  emailVerifyExpires: timestamp('emailVerifyExpires', { withTimezone: true, mode: 'date' }),
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
  // Attestation of the verification materials (009) — who signed off, and when.
  attestedAt: timestamp('attestedAt', { withTimezone: true, mode: 'date' }),
  attestedBy: integer('attestedBy').references(() => users.id),
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
  /* stock | surplus | overstock | liquidation | seconds | container
     See lib/api-zod zListingType and migrations/019_listing_type.sql. */
  listingType: text('listingType').notNull().default('stock'),
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
  // platform (a real buyer request) | demo (bootstrap seed data)
  dataSource: text('dataSource').notNull().default('platform'),
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
  // Billing (009): proforma number + payment state, tracked separately from the
  // fulfilment `status` above (pending → paid → shipped → delivered).
  proformaNumber: text('proformaNumber'),
  paymentStatus: text('paymentStatus').notNull().default('unpaid'),
  paidAt: timestamp('paidAt', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

/* ---------------------------------------------------------------------------
 * Platform tables (migrations/009_platform_tables.sql)
 * ------------------------------------------------------------------------ */

export const offers = pgTable('offers', {
  id: serial('id').primaryKey(),
  productId: integer('productId')
    .notNull()
    .references(() => products.id),
  buyerId: integer('buyerId')
    .notNull()
    .references(() => users.id),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  unitPrice: numeric('unitPrice', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  // The offer this row counters — a negotiation is an immutable chain of rows.
  parentOfferId: integer('parentOfferId').references((): AnyPgColumn => offers.id),
  // pending | countered | accepted | rejected | withdrawn
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const threads = pgTable('threads', {
  id: serial('id').primaryKey(),
  buyerId: integer('buyerId')
    .notNull()
    .references(() => users.id),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  productId: integer('productId').references(() => products.id),
  subject: text('subject'),
  lastMessageAt: timestamp('lastMessageAt', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  threadId: integer('threadId')
    .notNull()
    .references(() => threads.id),
  senderId: integer('senderId')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  // NULL = unread; a read receipt keeps the timestamp, it does not just flag.
  readAt: timestamp('readAt', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const savedLots = pgTable(
  'saved_lots',
  {
    userId: integer('userId')
      .notNull()
      .references(() => users.id),
    productId: integer('productId')
      .notNull()
      .references(() => products.id),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export const shipments = pgTable('shipments', {
  id: serial('id').primaryKey(),
  orderId: integer('orderId')
    .notNull()
    .references(() => orders.id),
  // Position in the milestone list; `milestones` holds the ordered entries.
  step: integer('step').notNull().default(0),
  milestones: jsonb('milestones').notNull().default([]),
  trackingNo: text('trackingNo'),
  carrier: text('carrier'),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('userId')
    .notNull()
    .references(() => users.id),
  role: text('role'),
  text: text('text').notNull(),
  type: text('type'),
  read: boolean('read').notNull().default(false),
  link: text('link'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const supplierDocs = pgTable('supplier_docs', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplierId')
    .notNull()
    .references(() => suppliers.id),
  docType: text('docType').notNull(),
  // missing | submitted | approved | rejected
  status: text('status').notNull().default('missing'),
  fileKey: text('fileKey'),
  reviewedBy: integer('reviewedBy').references(() => users.id),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true, mode: 'date' }),
  note: text('note'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  label: text('label').notNull(),
  description: text('description'),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const banners = pgTable('banners', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body'),
  placement: text('placement').notNull().default('home'),
  imageKey: text('imageKey'),
  href: text('href'),
  active: boolean('active').notNull().default(false),
  startsAt: timestamp('startsAt', { withTimezone: true, mode: 'date' }),
  endsAt: timestamp('endsAt', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const faqs = pgTable('faqs', {
  id: serial('id').primaryKey(),
  category: text('category'),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  position: integer('position').notNull().default(0),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  // Nullable: a logged-out visitor can still file a ticket.
  userId: integer('userId').references(() => users.id),
  subject: text('subject').notNull(),
  body: text('body'),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const productViews = pgTable('product_views', {
  id: serial('id').primaryKey(),
  productId: integer('productId')
    .notNull()
    .references(() => products.id),
  // NULL for anonymous browsing.
  userId: integer('userId').references(() => users.id),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('orderId')
    .notNull()
    .references(() => orders.id),
  method: text('method').notNull().default('bank_transfer'),
  reference: text('reference'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  // awaiting | confirmed | rejected | refunded
  status: text('status').notNull().default('awaiting'),
  proofKey: text('proofKey'),
  confirmedBy: integer('confirmedBy').references(() => users.id),
  confirmedAt: timestamp('confirmedAt', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' }).defaultNow(),
});

export const emailOutbox = pgTable('email_outbox', {
  id: serial('id').primaryKey(),
  toEmail: text('toEmail').notNull(),
  subject: text('subject').notNull(),
  template: text('template').notNull(),
  payload: jsonb('payload').notNull().default({}),
  // queued | sent | failed
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('lastError'),
  sentAt: timestamp('sentAt', { withTimezone: true, mode: 'date' }),
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

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type SavedLot = typeof savedLots.$inferSelect;
export type NewSavedLot = typeof savedLots.$inferInsert;

export type Shipment = typeof shipments.$inferSelect;
export type NewShipment = typeof shipments.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type SupplierDoc = typeof supplierDocs.$inferSelect;
export type NewSupplierDoc = typeof supplierDocs.$inferInsert;

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;

export type Banner = typeof banners.$inferSelect;
export type NewBanner = typeof banners.$inferInsert;

export type Faq = typeof faqs.$inferSelect;
export type NewFaq = typeof faqs.$inferInsert;

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;

export type ProductView = typeof productViews.$inferSelect;
export type NewProductView = typeof productViews.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type EmailOutboxEntry = typeof emailOutbox.$inferSelect;
export type NewEmailOutboxEntry = typeof emailOutbox.$inferInsert;
