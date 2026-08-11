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
