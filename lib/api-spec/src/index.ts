/**
 * FactoryDepo API route table. Mirrors lib/api-zod (single source of truth).
 * auth: 'public' | 'user' | 'buyer' | 'supplier'
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
] as const;

export const COUNTRIES = ['Türkiye', 'China', 'Vietnam', 'Germany', 'India', 'USA', 'Italy', 'Poland', 'Mexico', 'South Korea', 'Japan'] as const;
