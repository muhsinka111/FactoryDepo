/**
 * FactoryDepo React API client — fetch wrapper + React Query hooks.
 * Token stored in localStorage ('fd_token'), sent as `Authorization: Bearer`.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import * as c from '@workspace/api-zod';

const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:9090/api';

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

export function useRfqs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['rfqs'],
    queryFn: () => apiFetch<c.RfqList>('/rfqs'),
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
