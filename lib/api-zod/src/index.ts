/**
 * FactoryDepo API contracts — SINGLE SOURCE OF TRUTH.
 * api-server validates requests with these schemas; api-client-react derives
 * hook types from them; api-spec mirrors them in the route table.
 */
import { z } from 'zod';

/* ---------- roles ---------- */
export const zRole = z.enum(['buyer', 'supplier', 'inspector', 'lab', 'logistics', 'admin']);
export type Role = z.infer<typeof zRole>;

/* ---------- auth ---------- */
export const zRegisterInput = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
  role: zRole.default('buyer'),
  company: z.string().max(120).optional(),
  country: z.string().max(60).optional(),
  lang: z.string().max(8).default('en'),
});
export type RegisterInput = z.infer<typeof zRegisterInput>;

export const zLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof zLoginInput>;

export const zUser = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  role: zRole,
  company: z.string().nullable(),
  country: z.string().nullable(),
  lang: z.string(),
  trustScore: z.number(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof zUser>;

export const zAuthResponse = z.object({
  token: z.string(),
  user: zUser,
});
export type AuthResponse = z.infer<typeof zAuthResponse>;

/* ---------- products ---------- */
export const zProductStatus = z.enum(['active', 'sold_out']);
export const zDataSource = z.enum(['platform', 'demo']);

export const zProduct = z.object({
  id: z.number(),
  supplierId: z.number(),
  supplierName: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  spec: z.array(z.string()),
  price: z.number(),
  currency: z.string(),
  unit: z.string(),
  moq: z.number(),
  originCountry: z.string(),
  purityGrade: z.string().nullable(),
  verified: z.boolean(),
  trustScore: z.number(),
  imageKey: z.string().nullable(),
  quantityAvailable: z.number(),
  status: zProductStatus,
  dataSource: zDataSource,
  createdAt: z.string(),
});
export type Product = z.infer<typeof zProduct>;

export const zProductListQuery = z.object({
  q: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  country: z.string().max(60).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  hasImage: z.coerce.number().int().min(0).max(1).optional(),
  // mine=1 scopes the list to the caller's own listings (supplier dashboard).
  // Requires auth; ignored for anonymous callers, who get the public catalogue.
  mine: z.coerce.number().int().min(0).max(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductListQuery = z.infer<typeof zProductListQuery>;

export const zProductList = z.object({
  items: z.array(zProduct),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
});
export type ProductList = z.infer<typeof zProductList>;

/* ---------- suppliers ---------- */
export const zSupplier = z.object({
  id: z.number(),
  companyName: z.string(),
  country: z.string(),
  city: z.string().nullable(),
  description: z.string().nullable(),
  verifiedLevel: z.number(),
  rating: z.number(),
  inspectionsCount: z.number(),
  fulfillmentRate: z.number(),
  tags: z.array(z.string()),
  since: z.number().nullable(),
  trustScore: z.number(),
  productCount: z.number(),
  dataSource: zDataSource,
});
export type Supplier = z.infer<typeof zSupplier>;

export const zSupplierList = z.object({
  items: z.array(zSupplier),
  total: z.number(),
});
export type SupplierList = z.infer<typeof zSupplierList>;

/* ---------- RFQs ---------- */
export const zRfqStatus = z.enum(['open', 'quoted', 'closed']);
export const zRfq = z.object({
  id: z.number(),
  buyerId: z.number(),
  title: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  targetCountry: z.string().nullable(),
  status: zRfqStatus,
  quoteCount: z.number(),
  deadline: z.string().nullable(),
  createdAt: z.string(),
});
export type Rfq = z.infer<typeof zRfq>;

export const zCreateRfqInput = z.object({
  title: z.string().min(5).max(160),
  category: z.string().min(1).max(60),
  description: z.string().max(2000).optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(20),
  targetCountry: z.string().max(60).optional(),
});
export type CreateRfqInput = z.infer<typeof zCreateRfqInput>;

export const zRfqList = z.object({
  items: z.array(zRfq),
  total: z.number(),
});
export type RfqList = z.infer<typeof zRfqList>;

/* ---------- quotes ---------- */
export const zQuoteStatus = z.enum(['submitted', 'accepted', 'rejected']);
export const zQuote = z.object({
  id: z.number(),
  rfqId: z.number(),
  supplierId: z.number(),
  supplierName: z.string(),
  price: z.number(),
  currency: z.string(),
  leadTimeDays: z.number(),
  notes: z.string().nullable(),
  status: zQuoteStatus,
  trustScore: z.number(),
  createdAt: z.string(),
});
export type Quote = z.infer<typeof zQuote>;

export const zCreateQuoteInput = z.object({
  price: z.coerce.number().positive(),
  currency: z.string().max(8).default('USD'),
  leadTimeDays: z.coerce.number().int().positive().max(365),
  notes: z.string().max(1000).optional(),
});
export type CreateQuoteInput = z.infer<typeof zCreateQuoteInput>;

export const zRfqDetail = z.object({
  rfq: zRfq,
  quotes: z.array(zQuote),
});
export type RfqDetail = z.infer<typeof zRfqDetail>;

/* ---------- orders (buy-now / dropshipping) ---------- */
export const zOrderStatus = z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']);
export const zOrder = z.object({
  id: z.number(),
  buyerId: z.number(),
  productId: z.number(),
  supplierId: z.number(),
  productName: z.string(),
  supplierName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  currency: z.string(),
  total: z.number(),
  status: zOrderStatus,
  shippingName: z.string(),
  shippingAddress: z.string(),
  shippingCity: z.string(),
  shippingCountry: z.string(),
  shippingPhone: z.string().nullable(),
  notes: z.string().nullable(),
  side: z.enum(['buying', 'selling']),
  createdAt: z.string(),
});
export type Order = z.infer<typeof zOrder>;

export const zCreateOrderInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.coerce.number().positive(),
  shippingName: z.string().min(2).max(120),
  shippingAddress: z.string().min(5).max(300),
  shippingCity: z.string().min(1).max(100),
  shippingCountry: z.string().min(1).max(60),
  shippingPhone: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateOrderInput = z.infer<typeof zCreateOrderInput>;

export const zOrderList = z.object({
  items: z.array(zOrder),
  total: z.number(),
});
export type OrderList = z.infer<typeof zOrderList>;

/* ---------- dashboard stats ---------- */
export const zDashboardStats = z.object({
  totalListings: z.number(),
  activeOffers: z.number(),
  totalViews: z.number(),
  orders: z.number(),
  soldItems: z.number(),
});
export type DashboardStats = z.infer<typeof zDashboardStats>;

/* ---------- misc ---------- */
export const zHealth = z.object({
  status: z.literal('ok'),
  db: z.enum(['up', 'down']),
  time: z.string(),
});
export type Health = z.infer<typeof zHealth>;

export const zApiError = z.object({
  error: z.string(),
  details: z.string().optional(),
});
export type ApiError = z.infer<typeof zApiError>;

/* ==========================================================================
 * Platform contracts (migrations/009_platform_tables.sql)
 * --------------------------------------------------------------------------
 * Money is numeric in Postgres, so every money field is z.coerce.number() —
 * never float math in JS. Rows that carry provenance (directly, or through the
 * product they hang off) expose zDataSource so a 'demo' row stays labelable in
 * the UI (AGENTS.md: a buyer must never be misled).
 * ========================================================================== */

/* ---------- offers (lot-by-lot negotiation) ---------- */
export const zOfferStatus = z.enum(['pending', 'countered', 'accepted', 'rejected', 'withdrawn']);

export const zOffer = z.object({
  id: z.number(),
  productId: z.number(),
  productName: z.string(),
  buyerId: z.number(),
  buyerName: z.string(),
  supplierId: z.number(),
  supplierName: z.string(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  currency: z.string(),
  parentOfferId: z.number().nullable(),
  status: zOfferStatus,
  notes: z.string().nullable(),
  // Provenance of the underlying lot, so an offer on demo supply is labelable.
  dataSource: zDataSource,
  createdAt: z.string(),
});
export type Offer = z.infer<typeof zOffer>;

export const zCreateOfferInput = z.object({
  productId: z.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().positive(),
  currency: z.string().max(8).default('USD'),
  notes: z.string().max(1000).optional(),
});
export type CreateOfferInput = z.infer<typeof zCreateOfferInput>;

/** Counter an existing offer — the offer being answered comes from the path. */
export const zCounterOfferInput = z.object({
  unitPrice: z.coerce.number().positive(),
  quantity: z.coerce.number().positive().optional(),
  currency: z.string().max(8).optional(),
  notes: z.string().max(1000).optional(),
});
export type CounterOfferInput = z.infer<typeof zCounterOfferInput>;

export const zOfferList = z.object({
  items: z.array(zOffer),
  total: z.number(),
});
export type OfferList = z.infer<typeof zOfferList>;

/* ---------- threads + messages ---------- */
export const zThread = z.object({
  id: z.number(),
  buyerId: z.number(),
  buyerName: z.string(),
  supplierId: z.number(),
  supplierName: z.string(),
  productId: z.number().nullable(),
  productName: z.string().nullable(),
  subject: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  messageCount: z.number(),
  // Messages from the other party not yet read by the viewer.
  unreadCount: z.number(),
  // Null when the thread is not about a specific lot.
  dataSource: zDataSource.nullable(),
  createdAt: z.string(),
});
export type Thread = z.infer<typeof zThread>;

export const zMessage = z.object({
  id: z.number(),
  threadId: z.number(),
  senderId: z.number(),
  senderName: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof zMessage>;

export const zSendMessageInput = z.object({
  body: z.string().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof zSendMessageInput>;

/**
 * Open a conversation. `supplierId` is the counterparty's directory id; the
 * buyer side is always the caller, so it is not part of the input.
 */
export const zThreadCreateInput = z.object({
  supplierId: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  subject: z.string().min(1).max(200).optional(),
});
export type ThreadCreateInput = z.infer<typeof zThreadCreateInput>;

export const zThreadDetail = z.object({
  thread: zThread,
  messages: z.array(zMessage),
});
export type ThreadDetail = z.infer<typeof zThreadDetail>;

export const zThreadList = z.object({
  items: z.array(zThread),
  total: z.number(),
});
export type ThreadList = z.infer<typeof zThreadList>;

/* ---------- saved lots (buyer shortlist) ---------- */
export const zSavedLot = z.object({
  userId: z.number(),
  productId: z.number(),
  // The full listing, so a shortlist renders the same card as the feed and
  // keeps its dataSource tag.
  product: zProduct,
  createdAt: z.string(),
});
export type SavedLot = z.infer<typeof zSavedLot>;

export const zSaveLotInput = z.object({
  productId: z.number().int().positive(),
});
export type SaveLotInput = z.infer<typeof zSaveLotInput>;

export const zSavedLotList = z.object({
  items: z.array(zSavedLot),
  total: z.number(),
});
export type SavedLotList = z.infer<typeof zSavedLotList>;

/* ---------- shipments ---------- */
export const zShipmentMilestone = z.object({
  label: z.string(),
  // Null while the milestone is still ahead of the shipment.
  at: z.string().nullable(),
  note: z.string().nullable(),
});
export type ShipmentMilestone = z.infer<typeof zShipmentMilestone>;

export const zShipment = z.object({
  id: z.number(),
  orderId: z.number(),
  productName: z.string(),
  // Provenance of the ordered lot (join through orders → products).
  dataSource: zDataSource,
  // Number of milestones already reached; milestones[0..step-1] are done.
  step: z.number(),
  milestones: z.array(zShipmentMilestone),
  trackingNo: z.string().nullable(),
  carrier: z.string().nullable(),
  updatedAt: z.string(),
});
export type Shipment = z.infer<typeof zShipment>;

export const zAdvanceShipmentInput = z.object({
  label: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  trackingNo: z.string().max(80).optional(),
  carrier: z.string().max(80).optional(),
});
export type AdvanceShipmentInput = z.infer<typeof zAdvanceShipmentInput>;

export const zShipmentList = z.object({
  items: z.array(zShipment),
  total: z.number(),
});
export type ShipmentList = z.infer<typeof zShipmentList>;

/* ---------- notifications ---------- */
export const zNotification = z.object({
  id: z.number(),
  userId: z.number(),
  role: z.string().nullable(),
  text: z.string(),
  type: z.string().nullable(),
  read: z.boolean(),
  link: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof zNotification>;

export const zNotificationList = z.object({
  items: z.array(zNotification),
  total: z.number(),
  // Real count of unread rows, not an estimated badge.
  unread: z.number(),
});
export type NotificationList = z.infer<typeof zNotificationList>;

/* ---------- supplier docs (verification desk) ---------- */
export const zSupplierDocStatus = z.enum(['missing', 'submitted', 'approved', 'rejected']);

export const zSupplierDoc = z.object({
  id: z.number(),
  supplierId: z.number(),
  docType: z.string(),
  status: zSupplierDocStatus,
  fileKey: z.string().nullable(),
  reviewedBy: z.number().nullable(),
  reviewedAt: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type SupplierDoc = z.infer<typeof zSupplierDoc>;

export const zReviewDocInput = z.object({
  status: zSupplierDocStatus,
  note: z.string().max(1000).optional(),
});
export type ReviewDocInput = z.infer<typeof zReviewDocInput>;

export const zSupplierDocList = z.object({
  items: z.array(zSupplierDoc),
  total: z.number(),
});
export type SupplierDocList = z.infer<typeof zSupplierDocList>;

/* ---------- feature flags ---------- */
export const zFeatureFlag = z.object({
  key: z.string(),
  enabled: z.boolean(),
  label: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string(),
});
export type FeatureFlag = z.infer<typeof zFeatureFlag>;

export const zUpdateFeatureFlagInput = z.object({
  /** Which flag to toggle — the admin console PATCHes by key, not by path. */
  key: z.string().min(1).max(80),
  enabled: z.boolean(),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
});
export type UpdateFeatureFlagInput = z.infer<typeof zUpdateFeatureFlagInput>;

export const zFeatureFlagList = z.object({
  items: z.array(zFeatureFlag),
  total: z.number(),
});
export type FeatureFlagList = z.infer<typeof zFeatureFlagList>;

/* ---------- banners ---------- */
export const zBanner = z.object({
  id: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  placement: z.string(),
  imageKey: z.string().nullable(),
  href: z.string().nullable(),
  active: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Banner = z.infer<typeof zBanner>;

export const zBannerList = z.object({
  items: z.array(zBanner),
  total: z.number(),
});
export type BannerList = z.infer<typeof zBannerList>;

/* ---------- faqs ---------- */
export const zFaq = z.object({
  id: z.number(),
  category: z.string().nullable(),
  question: z.string(),
  answer: z.string(),
  position: z.number(),
});
export type Faq = z.infer<typeof zFaq>;

export const zFaqList = z.object({
  items: z.array(zFaq),
  total: z.number(),
});
export type FaqList = z.infer<typeof zFaqList>;

/* ---------- support tickets ---------- */
export const zTicketPriority = z.enum(['low', 'normal', 'high', 'urgent']);

export const zSupportTicket = z.object({
  id: z.number(),
  // Null for a ticket filed while logged out.
  userId: z.number().nullable(),
  subject: z.string(),
  body: z.string().nullable(),
  priority: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type SupportTicket = z.infer<typeof zSupportTicket>;

export const zCreateTicketInput = z.object({
  subject: z.string().min(3).max(160),
  body: z.string().max(2000).optional(),
  priority: zTicketPriority.default('normal'),
});
export type CreateTicketInput = z.infer<typeof zCreateTicketInput>;

export const zSupportTicketList = z.object({
  items: z.array(zSupportTicket),
  total: z.number(),
});
export type SupportTicketList = z.infer<typeof zSupportTicketList>;

/* ---------- payments (bank transfer / proforma) ---------- */
export const zPaymentStatus = z.enum(['awaiting', 'confirmed', 'rejected', 'refunded']);

export const zPayment = z.object({
  id: z.number(),
  orderId: z.number(),
  method: z.string(),
  reference: z.string().nullable(),
  amount: z.coerce.number(),
  currency: z.string(),
  status: zPaymentStatus,
  proofKey: z.string().nullable(),
  confirmedBy: z.number().nullable(),
  confirmedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Payment = z.infer<typeof zPayment>;

export const zRecordPaymentInput = z.object({
  orderId: z.number().int().positive(),
  method: z.string().max(40).default('bank_transfer'),
  reference: z.string().max(120).optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().max(8).default('USD'),
  proofKey: z.string().max(300).optional(),
});
export type RecordPaymentInput = z.infer<typeof zRecordPaymentInput>;

export const zConfirmPaymentInput = z.object({
  status: z.enum(['confirmed', 'rejected']).default('confirmed'),
  reference: z.string().max(120).optional(),
});
export type ConfirmPaymentInput = z.infer<typeof zConfirmPaymentInput>;

export const zPaymentList = z.object({
  items: z.array(zPayment),
  total: z.number(),
});
export type PaymentList = z.infer<typeof zPaymentList>;

/* ---------- admin: suppliers + overview ---------- */
export const zAdminSupplier = z.object({
  id: z.number(),
  companyName: z.string(),
  country: z.string(),
  city: z.string().nullable(),
  contactEmail: z.string().nullable(),
  verifiedLevel: z.number(),
  rating: z.number(),
  trustScore: z.number(),
  productCount: z.number(),
  // platform (real listing) | demo (bootstrap seed data)
  dataSource: zDataSource,
  attestedAt: z.string().nullable(),
  attestedBy: z.number().nullable(),
  // Real counts over supplier_docs, per status.
  docsMissing: z.number(),
  docsSubmitted: z.number(),
  docsApproved: z.number(),
  docsRejected: z.number(),
  createdAt: z.string(),
});
export type AdminSupplier = z.infer<typeof zAdminSupplier>;

export const zAdminSupplierList = z.object({
  items: z.array(zAdminSupplier),
  total: z.number(),
});
export type AdminSupplierList = z.infer<typeof zAdminSupplierList>;

/**
 * Admin overview — every field is a COUNT/SUM over a real table, so no metric
 * here can be an invented number. `demoProducts`/`platformProducts` keep the
 * provenance split visible; `paymentsConfirmedTotal` sums confirmed payments
 * only (numeric in Postgres, coerced here — no float math in JS).
 */
export const zAdminOverview = z.object({
  users: z.number(),
  buyers: z.number(),
  suppliers: z.number(),
  products: z.number(),
  demoProducts: z.number(),
  platformProducts: z.number(),
  rfqs: z.number(),
  quotes: z.number(),
  orders: z.number(),
  offers: z.number(),
  openOffers: z.number(),
  threads: z.number(),
  messages: z.number(),
  shipments: z.number(),
  paymentsAwaiting: z.number(),
  paymentsConfirmedTotal: z.coerce.number(),
  docsAwaitingReview: z.number(),
  supportTicketsOpen: z.number(),
  productViews: z.number(),
  emailsQueued: z.number(),
});
export type AdminOverview = z.infer<typeof zAdminOverview>;

/* ==========================================================================
 * Request contracts that Phase 3 routes need and this file did not yet carry.
 * --------------------------------------------------------------------------
 * Output shapes above are the authority for responses; these are the *inputs*
 * for the write endpoints that had no input schema yet (product CRUD, admin
 * console mutations). They exist here — not inline in the route file — so the
 * api-spec table and the client hooks can mirror them, per AGENTS.md.
 * ========================================================================== */

/**
 * Supplier listing creation. `supplierId` is deliberately absent: the seller is
 * always the caller's own supplier row, never a body field (an "edit someone
 * else's listing" bug starts with trusting a body-supplied supplierId).
 * New listings are real supply, so the route hard-codes dataSource 'platform'.
 */
export const zCreateProductInput = z.object({
  name: z.string().min(2).max(160),
  category: z.string().min(1).max(60),
  description: z.string().max(4000).optional(),
  spec: z.array(z.string().max(300)).max(40).optional(),
  price: z.coerce.number().positive(),
  currency: z.string().max(8).default('USD'),
  unit: z.string().min(1).max(20),
  // Optional with a safe default: the required set is name/category/price/unit.
  moq: z.coerce.number().positive().default(1),
  originCountry: z.string().min(1).max(60).optional(),
  purityGrade: z.string().max(40).optional(),
  imageKey: z.string().max(300).optional(),
  quantityAvailable: z.coerce.number().nonnegative().default(0),
  status: zProductStatus.default('active'),
});
export type CreateProductInput = z.infer<typeof zCreateProductInput>;

/** Partial listing edit — ownership is enforced by the route, not by the shape. */
export const zUpdateProductInput = zCreateProductInput.partial();
export type UpdateProductInput = z.infer<typeof zUpdateProductInput>;

/** Supplier verification-desk submission (upsert) for one document type. */
export const zSubmitDocInput = z.object({
  docType: z.string().min(1).max(60),
  fileKey: z.string().max(300).optional(),
  note: z.string().max(1000).optional(),
});
export type SubmitDocInput = z.infer<typeof zSubmitDocInput>;

/** Admin: edit a support ticket's status/priority (id selects the row). */
export const zUpdateTicketInput = z.object({
  id: z.number().int().positive(),
  status: z.string().min(1).max(40).optional(),
  priority: zTicketPriority.optional(),
  note: z.string().max(1000).optional(),
});
export type UpdateTicketInput = z.infer<typeof zUpdateTicketInput>;

/** Admin: create a banner placement. */
export const zCreateBannerInput = z.object({
  title: z.string().min(2).max(160),
  body: z.string().max(1000).optional(),
  placement: z.string().min(1).max(40).default('home'),
  imageKey: z.string().max(300).optional(),
  href: z.string().max(300).optional(),
  active: z.boolean().default(false),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type CreateBannerInput = z.infer<typeof zCreateBannerInput>;

/** Admin: create a help-centre FAQ. */
export const zCreateFaqInput = z.object({
  category: z.string().max(60).optional(),
  question: z.string().min(3).max(300),
  answer: z.string().min(1).max(4000),
  position: z.coerce.number().int().min(0).default(0),
});
export type CreateFaqInput = z.infer<typeof zCreateFaqInput>;
