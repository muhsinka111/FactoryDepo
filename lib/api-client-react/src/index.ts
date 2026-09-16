/**
 * FactoryDepo React API client — fetch wrapper + React Query hooks.
 * Token stored in localStorage ('fd_token'), sent as `Authorization: Bearer`.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import * as c from '@workspace/api-zod';

const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  '/api'; // same-origin (Vite dev proxy /api/ → :9091, prod serves API + SPA together)

const TOKEN_KEY = 'fd_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  let url = `${API_BASE}${path}`;
  if (opts.query) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = (data as { error?: string; details?: string }) ?? {};
    throw new ApiError(err.error ?? `http_${res.status}`, err.details ?? err.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/* ---------- hooks ---------- */

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<c.Health>('/healthz'),
    refetchInterval: 30_000,
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.RegisterInput) => apiFetch<c.AuthResponse>('/auth/register', { method: 'POST', body: input, auth: false }),
    onSuccess: (res) => {
      setToken(res.token);
      qc.setQueryData(['me'], res.user);
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.LoginInput) => apiFetch<c.AuthResponse>('/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: (res) => {
      setToken(res.token);
      qc.setQueryData(['me'], res.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return () => {
    setToken(null);
    qc.clear();
  };
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<c.User>('/me'),
    enabled: !!getToken(),
    retry: false,
  });
}

export function useProducts(query: Partial<c.ProductListQuery> = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['products', query],
    queryFn: () => apiFetch<c.ProductList>('/products', { query: { ...query } }),
    enabled: options?.enabled ?? true,
  });
}

export function useProduct(id: number | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => apiFetch<c.Product>(`/products/${id}`),
    enabled: id !== undefined,
  });
}

export function useSuppliers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiFetch<c.SupplierList>('/suppliers'),
    enabled: options?.enabled ?? true,
  });
}

export function useSupplier(id: number | undefined) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: () => apiFetch<c.Supplier>(`/suppliers/${id}`),
    enabled: id !== undefined,
  });
}

/**
 * GET /api/rfqs — unscoped public exchange by default. Pass `mine: true` to
 * ask the server for the caller's own RFQs (`?mine=1`); the request stays
 * param-free otherwise, because the marketing landing reads the unscoped list.
 */
export function useRfqs(options?: { enabled?: boolean; mine?: boolean }) {
  const mine = options?.mine === true;
  return useQuery({
    queryKey: mine ? ['rfqs', 'mine'] : ['rfqs'],
    queryFn: () => apiFetch<c.RfqList>('/rfqs', mine ? { query: { mine: 1 } } : {}),
    enabled: options?.enabled ?? true,
  });
}

export function useRfqDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['rfq', id],
    queryFn: () => apiFetch<c.RfqDetail>(`/rfqs/${id}`),
    enabled: id !== undefined,
  });
}

export function useCreateRfq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.CreateRfqInput) => apiFetch<c.Rfq>('/rfqs', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rfqs'] }),
  });
}

export function useCreateQuote(rfqId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.CreateQuoteInput) => apiFetch<c.Quote>(`/rfqs/${rfqId}/quotes`, { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rfq', rfqId] });
      qc.invalidateQueries({ queryKey: ['rfqs'] });
    },
  });
}

/* ---------- orders (buy-now / dropshipping) ---------- */

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.CreateOrderInput) => apiFetch<c.Order>('/orders', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
    },
  });
}

export function useMyOrders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => apiFetch<c.OrderList>('/orders'),
    enabled: options?.enabled ?? true,
  });
}

export function useDashboardStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['order-stats'],
    queryFn: () => apiFetch<c.DashboardStats>('/orders/stats'),
    enabled: options?.enabled ?? true,
  });
}

/* ==========================================================================
 * Phase 3 — offers, saved lots, threads, shipments, notifications, supplier
 * listing/doc management, proforma + payments, admin console.
 * --------------------------------------------------------------------------
 * Query-key convention (matches the hooks above): a list lives under one key
 * (['offers'], ['saved'], …) and every mutation that can change it invalidates
 * that same key, so dashboards refresh without a page reload.
 * ========================================================================== */

/**
 * Request bodies that have no api-zod contract yet, derived from the response
 * contract instead of being re-declared by hand — a field can never drift from
 * the schema the server validates (and nothing is `any`).
 */
export type CreateThreadInput = Pick<c.Thread, 'supplierId'> &
  Partial<Pick<c.Thread, 'productId' | 'subject'>>;

export type SubmitSupplierDocInput = Pick<c.SupplierDoc, 'docType'> &
  Partial<Pick<c.SupplierDoc, 'fileKey' | 'note'>>;

export type CreateProductInput = Pick<c.Product, 'name' | 'category' | 'price' | 'unit'> &
  Partial<
    Pick<
      c.Product,
      'description' | 'spec' | 'currency' | 'moq' | 'originCountry' | 'purityGrade' | 'imageKey' | 'quantityAvailable'
    >
  >;

export type UpdateProductInput = Partial<
  Pick<
    c.Product,
    | 'name'
    | 'category'
    | 'description'
    | 'spec'
    | 'price'
    | 'currency'
    | 'unit'
    | 'moq'
    | 'originCountry'
    | 'purityGrade'
    | 'imageKey'
    | 'quantityAvailable'
    | 'status'
  >
>;

export type UpdateMeInput = Partial<Pick<c.User, 'name' | 'company' | 'country' | 'lang'>>;

export type CreateBannerInput = Pick<c.Banner, 'title' | 'placement'> &
  Partial<Pick<c.Banner, 'body' | 'imageKey' | 'href' | 'active' | 'startsAt' | 'endsAt'>>;

export type CreateFaqInput = Pick<c.Faq, 'question' | 'answer'> &
  Partial<Pick<c.Faq, 'category' | 'position'>>;

/**
 * Response of a mutation that has no api-zod output contract: it only
 * acknowledges the state change, and the caller re-reads the affected list
 * through its invalidated query key.
 */
export interface AckResponse {
  ok?: boolean;
  updated?: number;
}

/* ---------- offers ---------- */

export function useMyOffers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['offers'],
    queryFn: () => apiFetch<c.OfferList>('/offers'),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.CreateOfferInput) => apiFetch<c.Offer>('/offers', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

/** Counter an offer — `id` is the offer being answered (path param). */
export function useCounterOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: c.CounterOfferInput & { id: number }) =>
      apiFetch<c.Offer>(`/offers/${id}/counter`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<c.Offer>(`/offers/${id}/accept`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<c.Offer>(`/offers/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

/* ---------- saved lots (buyer shortlist) ---------- */

export function useSavedLots(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['saved'],
    queryFn: () => apiFetch<c.SavedLotList>('/saved'),
    enabled: options?.enabled ?? true,
  });
}

export function useSaveLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.SaveLotInput) => apiFetch<c.SavedLot>('/saved', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved'] }),
  });
}

export function useUnsaveLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId }: { productId: number }) =>
      apiFetch<AckResponse>(`/saved/${productId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved'] }),
  });
}

/* ---------- threads + messages ---------- */

export function useThreads(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['threads'],
    queryFn: () => apiFetch<c.ThreadList>('/threads'),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateThreadInput) => apiFetch<c.Thread>('/threads', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function useThread(id: number | undefined) {
  return useQuery({
    queryKey: ['thread', id],
    queryFn: () => apiFetch<c.ThreadDetail>(`/threads/${id}`),
    enabled: id !== undefined,
  });
}

export function useSendMessage(threadId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: c.SendMessageInput) =>
      apiFetch<c.Message>(`/threads/${threadId}/messages`, { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

/* ---------- shipments ---------- */

export function useShipments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['shipments'],
    queryFn: () => apiFetch<c.ShipmentList>('/shipments'),
    enabled: options?.enabled ?? true,
  });
}

/** Advance a shipment — `id` is the shipment (path param). */
export function useAdvanceShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: c.AdvanceShipmentInput & { id: number }) =>
      apiFetch<c.Shipment>(`/shipments/${id}/advance`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
    },
  });
}

/* ---------- notifications ---------- */

export function useNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<c.NotificationList>('/notifications'),
    enabled: options?.enabled ?? true,
  });
}

/** Mark every unread notification read, then re-read the list. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<AckResponse>('/notifications/read', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/* ---------- supplier listings + verification docs ---------- */

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => apiFetch<c.Product>('/products', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
    },
  });
}

/** Update a listing — `id` is the product being edited (path param). */
export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateProductInput & { id: number }) =>
      apiFetch<c.Product>(`/products/${id}`, { method: 'PATCH', body }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', vars.id] });
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<AckResponse>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', vars.id] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
    },
  });
}

export function useSupplierDocs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['supplier-docs'],
    queryFn: () => apiFetch<c.SupplierDocList>('/supplier/docs'),
    enabled: options?.enabled ?? true,
  });
}

export function useSubmitSupplierDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitSupplierDocInput) =>
      apiFetch<c.SupplierDoc>('/supplier/docs', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-docs'] });
      qc.invalidateQueries({ queryKey: ['admin-docs'] });
      qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

/* ---------- proforma + payments (bank transfer) ---------- */

/** Issue the proforma for an order — `id` is the order (path param). */
export function useIssueProforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<c.Order>(`/orders/${id}/proforma`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
    },
  });
}

/**
 * Record a bank-transfer payment against an order. `id` is the order path
 * param; the body carries the amount/reference (`orderId` is also part of
 * zRecordPaymentInput, so callers normally pass the same order twice).
 */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: c.RecordPaymentInput & { id: number }) =>
      apiFetch<c.Payment>(`/orders/${id}/payments`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

/** Confirm a recorded payment — `id` is the payment (path param). */
export function useConfirmPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<c.ConfirmPaymentInput>) =>
      apiFetch<c.Payment>(`/payments/${id}/confirm`, { method: 'POST', body: { status: 'confirmed', ...body } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

/** Reject a recorded payment — `id` is the payment (path param). */
export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<c.ConfirmPaymentInput>) =>
      apiFetch<c.Payment>(`/payments/${id}/reject`, { method: 'POST', body: { status: 'rejected', ...body } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

export function usePayments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['payments'],
    queryFn: () => apiFetch<c.PaymentList>('/payments'),
    enabled: options?.enabled ?? true,
  });
}

/* ---------- admin console ---------- */

export function useAdminOverview(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiFetch<c.AdminOverview>('/admin/overview'),
    enabled: options?.enabled ?? true,
  });
}

export function useAdminSuppliers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: () => apiFetch<c.AdminSupplierList>('/admin/suppliers'),
    enabled: options?.enabled ?? true,
  });
}

export function useApproveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch<AckResponse>(`/admin/suppliers/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
}

export function useRejectSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch<AckResponse>(`/admin/suppliers/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
}

export function useAdminListings(query: Partial<c.ProductListQuery> = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin-listings', query],
    queryFn: () => apiFetch<c.ProductList>('/admin/listings', { query: { ...query } }),
    enabled: options?.enabled ?? true,
  });
}

export function useAdminRfqs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin-rfqs'],
    queryFn: () => apiFetch<c.RfqList>('/admin/rfqs'),
    enabled: options?.enabled ?? true,
  });
}

export function useAdminDocs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['admin-docs'],
    queryFn: () => apiFetch<c.SupplierDocList>('/admin/docs'),
    enabled: options?.enabled ?? true,
  });
}

/** Review a supplier document — `id` is the doc (path param). */
export function useReviewDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: c.ReviewDocInput & { id: number }) =>
      apiFetch<c.SupplierDoc>(`/admin/docs/${id}/review`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-docs'] });
      qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      qc.invalidateQueries({ queryKey: ['supplier-docs'] });
    },
  });
}

export function useFeatureFlags(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => apiFetch<c.FeatureFlagList>('/admin/features'),
    enabled: options?.enabled ?? true,
  });
}

/** Toggle a feature flag — `key` is the flag key (path param). */
export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...body }: c.UpdateFeatureFlagInput & { key: string }) =>
      apiFetch<c.FeatureFlag>(`/admin/features/${encodeURIComponent(key)}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-flags'] }),
  });
}

export function useBanners(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['banners'],
    queryFn: () => apiFetch<c.BannerList>('/admin/banners'),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBannerInput) => apiFetch<c.Banner>('/admin/banners', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  });
}

export function useFaqs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['faqs'],
    queryFn: () => apiFetch<c.FaqList>('/admin/faqs'),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFaqInput) => apiFetch<c.Faq>('/admin/faqs', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['faqs'] }),
  });
}

export function useTickets(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tickets'],
    queryFn: () => apiFetch<c.SupportTicketList>('/admin/tickets'),
    enabled: options?.enabled ?? true,
  });
}

/* ---------- me ---------- */

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => apiFetch<c.User>('/me', { method: 'PATCH', body: input }),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
