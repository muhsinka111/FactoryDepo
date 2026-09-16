/**
 * FactoryDepo API route table. Mirrors lib/api-zod (single source of truth).
 * auth: 'public' | 'user' | 'buyer' | 'supplier'
 *
 * There is no 'admin' tag in RouteDef (deliberate — the type is frozen), so
 * admin-only endpoints are tagged 'user' and say "Admin only" in `desc`.
 * Query-string-only filters that have no zod contract (e.g. GET /api/rfqs
 * ?mine=1) are not modelled in `input`.
 */
import type { z } from 'zod';
import * as c from '@workspace/api-zod';

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  auth: 'public' | 'user' | 'buyer' | 'supplier';
  input?: z.ZodType;
  output?: z.ZodType;
  desc: string;
}

export const ROUTES: RouteDef[] = [
  { method: 'GET', path: '/api/healthz', auth: 'public', output: c.zHealth, desc: 'Liveness + DB status' },
  { method: 'POST', path: '/api/auth/register', auth: 'public', input: c.zRegisterInput, output: c.zAuthResponse, desc: 'Create account (buyer/supplier/inspector/lab/logistics/admin)' },
  { method: 'POST', path: '/api/auth/login', auth: 'public', input: c.zLoginInput, output: c.zAuthResponse, desc: 'Login → Bearer token' },
  { method: 'GET', path: '/api/me', auth: 'user', output: c.zUser, desc: 'Current user profile' },

  { method: 'GET', path: '/api/products', auth: 'public', input: c.zProductListQuery, output: c.zProductList, desc: 'Search products: q, category, country, min/maxPrice, page, limit' },
  { method: 'GET', path: '/api/products/:id', auth: 'public', output: c.zProduct, desc: 'Product detail' },

  { method: 'GET', path: '/api/suppliers', auth: 'public', output: c.zSupplierList, desc: 'Verified supplier directory' },
  { method: 'GET', path: '/api/suppliers/:id', auth: 'public', output: c.zSupplier, desc: 'Supplier profile' },

  { method: 'GET', path: '/api/rfqs', auth: 'public', output: c.zRfqList, desc: 'Open RFQ exchange' },
  { method: 'POST', path: '/api/rfqs', auth: 'buyer', input: c.zCreateRfqInput, output: c.zRfq, desc: 'Post a request for quotation' },
  { method: 'GET', path: '/api/rfqs/:id', auth: 'public', output: c.zRfqDetail, desc: 'RFQ + submitted quotes' },
  { method: 'POST', path: '/api/rfqs/:id/quotes', auth: 'supplier', input: c.zCreateQuoteInput, output: c.zQuote, desc: 'Submit a quotation' },

  { method: 'POST', path: '/api/orders', auth: 'user', input: c.zCreateOrderInput, output: c.zOrder, desc: 'Place a buy-now order (dropship)' },
  { method: 'GET', path: '/api/orders', auth: 'user', output: c.zOrderList, desc: 'My orders (buyer: purchases, supplier: incoming)' },
  { method: 'GET', path: '/api/orders/stats', auth: 'user', output: c.zDashboardStats, desc: 'Dashboard metrics' },

  /* ---------- phase 3: offers (lot-by-lot negotiation) ---------- */
  { method: 'POST', path: '/api/offers', auth: 'buyer', input: c.zCreateOfferInput, output: c.zOffer, desc: 'Make an offer on a lot' },
  { method: 'GET', path: '/api/offers', auth: 'user', output: c.zOfferList, desc: 'My offers (buyer: sent, supplier: received)' },
  { method: 'POST', path: '/api/offers/:id/counter', auth: 'user', input: c.zCounterOfferInput, output: c.zOffer, desc: 'Counter an offer (either party on it)' },
  { method: 'POST', path: '/api/offers/:id/accept', auth: 'user', output: c.zOffer, desc: 'Accept an offer (either party on it)' },
  { method: 'POST', path: '/api/offers/:id/reject', auth: 'user', output: c.zOffer, desc: 'Reject an offer (either party on it)' },

  /* ---------- phase 3: saved lots (buyer shortlist) ---------- */
  { method: 'GET', path: '/api/saved', auth: 'buyer', output: c.zSavedLotList, desc: 'My saved lots' },
  { method: 'POST', path: '/api/saved', auth: 'buyer', input: c.zSaveLotInput, output: c.zSavedLot, desc: 'Save a lot to the shortlist' },
  { method: 'DELETE', path: '/api/saved/:productId', auth: 'buyer', desc: 'Remove a lot from the shortlist' },

  /* ---------- phase 3: threads + messages ---------- */
  { method: 'GET', path: '/api/threads', auth: 'user', output: c.zThreadList, desc: 'My negotiation threads' },
  { method: 'POST', path: '/api/threads', auth: 'buyer', output: c.zThread, desc: 'Open a thread with a supplier (optional productId)' },
  { method: 'GET', path: '/api/threads/:id', auth: 'user', output: c.zThreadDetail, desc: 'Thread + messages (participants only)' },
  { method: 'POST', path: '/api/threads/:id/messages', auth: 'user', input: c.zSendMessageInput, output: c.zMessage, desc: 'Send a message in a thread' },

  /* ---------- phase 3: shipments ---------- */
  { method: 'GET', path: '/api/shipments', auth: 'user', output: c.zShipmentList, desc: 'Shipments on my orders' },
  { method: 'POST', path: '/api/shipments/:id/advance', auth: 'supplier', input: c.zAdvanceShipmentInput, output: c.zShipment, desc: 'Advance a shipment milestone (supplier/admin)' },

  /* ---------- phase 3: notifications ---------- */
  { method: 'GET', path: '/api/notifications', auth: 'user', output: c.zNotificationList, desc: 'My notifications + real unread count' },
  { method: 'POST', path: '/api/notifications/read', auth: 'user', desc: 'Mark all my notifications read' },

  /* ---------- phase 3: supplier listing + doc management ---------- */
  { method: 'POST', path: '/api/products', auth: 'supplier', output: c.zProduct, desc: 'Create a listing on the caller supplier profile' },
  { method: 'PATCH', path: '/api/products/:id', auth: 'supplier', output: c.zProduct, desc: 'Update own listing' },
  { method: 'DELETE', path: '/api/products/:id', auth: 'supplier', desc: 'Delete own listing' },
  { method: 'GET', path: '/api/supplier/docs', auth: 'supplier', output: c.zSupplierDocList, desc: 'My verification documents' },
  { method: 'POST', path: '/api/supplier/docs', auth: 'supplier', output: c.zSupplierDoc, desc: 'Submit a verification document' },

  /* ---------- phase 3: proforma + payments (bank transfer) ---------- */
  { method: 'POST', path: '/api/orders/:id/proforma', auth: 'supplier', output: c.zOrder, desc: 'Issue a proforma invoice on an order (supplier/admin)' },
  { method: 'POST', path: '/api/orders/:id/payments', auth: 'user', input: c.zRecordPaymentInput, output: c.zPayment, desc: 'Record a bank-transfer payment against an order' },
  { method: 'POST', path: '/api/payments/:id/confirm', auth: 'supplier', input: c.zConfirmPaymentInput, output: c.zPayment, desc: 'Confirm a payment (supplier/admin)' },
  { method: 'POST', path: '/api/payments/:id/reject', auth: 'supplier', input: c.zConfirmPaymentInput, output: c.zPayment, desc: 'Reject a payment (supplier/admin)' },
  { method: 'GET', path: '/api/payments', auth: 'user', output: c.zPaymentList, desc: 'Payments on my orders' },

  /* ---------- phase 3: admin ---------- */
  { method: 'GET', path: '/api/admin/overview', auth: 'user', output: c.zAdminOverview, desc: 'Admin only — platform counts (all real COUNT/SUM)' },
  { method: 'GET', path: '/api/admin/suppliers', auth: 'user', output: c.zAdminSupplierList, desc: 'Admin only — supplier attestation queue' },
  { method: 'POST', path: '/api/admin/suppliers/:id/approve', auth: 'user', desc: 'Admin only — attest a supplier' },
  { method: 'POST', path: '/api/admin/suppliers/:id/reject', auth: 'user', desc: 'Admin only — reject a supplier attestation' },
  { method: 'GET', path: '/api/admin/listings', auth: 'user', input: c.zProductListQuery, output: c.zProductList, desc: 'Admin only — every listing incl. demo provenance' },
  { method: 'GET', path: '/api/admin/rfqs', auth: 'user', output: c.zRfqList, desc: 'Admin only — every RFQ' },
  { method: 'GET', path: '/api/admin/docs', auth: 'user', output: c.zSupplierDocList, desc: 'Admin only — supplier docs awaiting review' },
  { method: 'POST', path: '/api/admin/docs/:id/review', auth: 'user', input: c.zReviewDocInput, output: c.zSupplierDoc, desc: 'Admin only — approve/reject a supplier document' },
  { method: 'GET', path: '/api/admin/features', auth: 'user', output: c.zFeatureFlagList, desc: 'Admin only — feature flags' },
  { method: 'PATCH', path: '/api/admin/features/:key', auth: 'user', input: c.zUpdateFeatureFlagInput, output: c.zFeatureFlag, desc: 'Admin only — toggle a feature flag' },
  { method: 'GET', path: '/api/admin/banners', auth: 'user', output: c.zBannerList, desc: 'Admin only — banners' },
  { method: 'POST', path: '/api/admin/banners', auth: 'user', output: c.zBanner, desc: 'Admin only — create a banner' },
  { method: 'GET', path: '/api/admin/faqs', auth: 'user', output: c.zFaqList, desc: 'Admin only — FAQs' },
  { method: 'POST', path: '/api/admin/faqs', auth: 'user', output: c.zFaq, desc: 'Admin only — create an FAQ' },
  { method: 'GET', path: '/api/admin/tickets', auth: 'user', output: c.zSupportTicketList, desc: 'Admin only — support tickets' },
  { method: 'PATCH', path: '/api/me', auth: 'user', output: c.zUser, desc: 'Update own profile (name/company/country/lang)' },
];

export const CATEGORIES = [
  'Metals & Minerals',
  'Steel',
  'Chemicals',
  'Machinery',
  'Industrial Equipment',
  'Electronics',
  'Automotive',
  'Construction Materials',
  'Renewable Energy',
  'Packaging',
  'Plastic & Rubber',
  'Textiles',
  'Agriculture',
  'Energy',
  'Mining & Ore',
  'Paper & Pulp',
  'Rubber',
  'Ceramics & Glass',
  'Furniture & Wood',
  'Medical Supplies',
  'Safety & PPE',
  'Food Processing',
  'Marine & Offshore',
  'Aerospace',
] as const;

export const COUNTRIES = ['Türkiye', 'China', 'Vietnam', 'Germany', 'India', 'USA', 'Italy', 'Poland', 'Mexico', 'South Korea', 'Japan'] as const;
