import { getAuthHeader } from './authService';
import type {
  RbAnalyticsFilters,
  RbAnalyticsResponse,
  RbCategoryProductsResponse,
  RbChartsResponse,
  RbFilteredDashboardResponse,
  RbDashboardStats,
  RbKeysetPage,
  RbProfileResponse,
  RbSearchResponse,
  RbServiceRow,
  RbSummaryResponse,
  RbSyncJobResponse,
  RbTimelineItem,
} from '@/types/beneficiaries';

const API_BASE = '/.netlify/functions/beneficiaries-api';

function authHeaders(): HeadersInit {
  return { ...getAuthHeader() };
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string; err?: string; message?: string };
  if (!res.ok) {
    const msg = (body as { error?: string; err?: string; message?: string }).error
      || (body as { err?: string }).err
      || (body as { message?: string }).message
      || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function fetchDashboardSummary(): Promise<RbSummaryResponse> {
  const res = await fetch(`${API_BASE}/dashboard/summary`, { headers: authHeaders() });
  return readJson<RbSummaryResponse>(res);
}

export function analyticsQueryString(filters: RbAnalyticsFilters = {}): string {
  const qs = new URLSearchParams();
  if (filters.nationality) qs.set('nationality', filters.nationality);
  if (filters.gender) qs.set('gender', filters.gender);
  if (filters.age) qs.set('age', filters.age);
  if (filters.team) qs.set('team', filters.team);
  if (filters.category) qs.set('category', filters.category);
  if (filters.month) qs.set('month', filters.month);
  if (filters.feedback) qs.set('feedback', filters.feedback);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function fetchDashboardCharts(filters: RbAnalyticsFilters = {}): Promise<RbChartsResponse> {
  const res = await fetch(`${API_BASE}/dashboard/charts${analyticsQueryString(filters)}`, {
    headers: authHeaders(),
  });
  return readJson<RbChartsResponse>(res);
}

export async function fetchDashboardAnalytics(filters: RbAnalyticsFilters = {}): Promise<RbAnalyticsResponse> {
  const res = await fetch(`${API_BASE}/dashboard/analytics${analyticsQueryString(filters)}`, {
    headers: authHeaders(),
  });
  return readJson<RbAnalyticsResponse>(res);
}

/** Cross-filtered analytics + charts (parallel requests; works without /dashboard/filtered route). */
export async function fetchDashboardFiltered(
  filters: RbAnalyticsFilters
): Promise<RbFilteredDashboardResponse> {
  const [analytics, charts] = await Promise.all([
    fetchDashboardAnalytics(filters),
    fetchDashboardCharts(filters),
  ]);
  if (!analytics.ok || !charts.ok) {
    throw new Error('Dashboard filter request failed');
  }
  return { ok: true, analytics, charts, filters };
}

export async function fetchCategoryProducts(
  category: string,
  mode: 'cases' | 'services',
  filters: RbAnalyticsFilters = {}
): Promise<RbCategoryProductsResponse> {
  const qs = new URLSearchParams({ mode });
  if (filters.nationality) qs.set('nationality', filters.nationality);
  if (filters.gender) qs.set('gender', filters.gender);
  if (filters.age) qs.set('age', filters.age);
  if (filters.team) qs.set('team', filters.team);
  if (filters.category) qs.set('category', filters.category);
  if (filters.month) qs.set('month', filters.month);
  if (filters.feedback) qs.set('feedback', filters.feedback);
  const res = await fetch(
    `${API_BASE}/dashboard/categories/${encodeURIComponent(category)}/products?${qs.toString()}`,
    { headers: authHeaders() }
  );
  return readJson<RbCategoryProductsResponse>(res);
}

export async function fetchBeneficiariesSearch(q: string): Promise<RbSearchResponse> {
  const qs = new URLSearchParams({ q: q.trim() });
  const res = await fetch(`${API_BASE}/search?${qs.toString()}`, { headers: authHeaders() });
  return readJson<RbSearchResponse>(res);
}

export async function fetchCaseProfile(resCaseId: string): Promise<RbProfileResponse> {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(resCaseId)}/profile`, { headers: authHeaders() });
  return readJson<RbProfileResponse>(res);
}

export async function fetchCaseServicesPage(
  resCaseId: string,
  cursor: string | null,
  limit?: number
): Promise<RbKeysetPage<RbServiceRow>> {
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);
  if (limit != null) qs.set('limit', String(limit));
  const tail = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/${encodeURIComponent(resCaseId)}/services${tail}`, {
    headers: authHeaders(),
  });
  return readJson<RbKeysetPage<RbServiceRow>>(res);
}

export async function fetchCaseTimelinePage(
  resCaseId: string,
  cursor: string | null,
  limit?: number
): Promise<RbKeysetPage<RbTimelineItem>> {
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);
  if (limit != null) qs.set('limit', String(limit));
  const tail = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/${encodeURIComponent(resCaseId)}/timeline${tail}`, {
    headers: authHeaders(),
  });
  return readJson<RbKeysetPage<RbTimelineItem>>(res);
}

/** Queue background sync (202 + jobId). Requires Admin/CEO. */
export async function enqueueBeneficiariesSync(): Promise<{ ok: boolean; jobId: string }> {
  const res = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = (await res.json()) as { ok?: boolean; jobId?: string; err?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.err || body.error || `HTTP ${res.status}`);
  }
  if (res.status !== 202 || !body.jobId) {
    throw new Error(body.err || 'Sync was not queued (expected HTTP 202 with jobId)');
  }
  return { ok: true, jobId: String(body.jobId) };
}

/** Run sync in-request (large extracts — allow up to 10 minutes). Admin/CEO. */
export async function refreshBeneficiariesImmediate(): Promise<{ ok: boolean; meta: RbSummaryResponse['meta'] }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 600000);
  try {
    const res = await fetch(`${API_BASE}/sync?immediate=1`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    const body = (await res.json()) as {
      ok?: boolean;
      meta?: RbSummaryResponse['meta'];
      err?: string;
      hint?: string;
    };
    if (!res.ok) {
      const msg = body.err || body.hint || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body as { ok: boolean; meta: RbSummaryResponse['meta'] };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        'Sync timed out after 10 minutes. Use Queue Odoo sync — it runs in the background and the page will refresh when done.'
      );
    }
    throw e;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchBeneficiariesSyncJob(jobId: string): Promise<RbSyncJobResponse> {
  const res = await fetch(`${API_BASE}/sync/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
  let body: RbSyncJobResponse;
  try {
    body = (await res.json()) as RbSyncJobResponse;
  } catch {
    return { ok: false, err: 'parse_error' };
  }
  if (res.status === 404) {
    return { ok: false, err: 'not_found' };
  }
  if (!res.ok) {
    throw new Error((body as { err?: string }).err || 'Job status failed');
  }
  return body;
}

export function formatMonthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym || '';
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

/** Map summary + charts into KPI + chart props used by the dashboard cards. */
export function buildDashboardStats(
  summary: RbSummaryResponse | undefined,
  charts: RbChartsResponse | undefined,
  filteredCharts?: RbChartsResponse | undefined
): RbDashboardStats | null {
  if (!summary?.ok || !charts?.ok) return null;
  const k = filteredCharts?.kpis ?? summary.kpis;
  const chartSource = filteredCharts?.ok ? filteredCharts : charts;
  return {
    totalPrimaryCases: k.primaryCases,
    totalIndividuals: k.totalIndividuals,
    totalServices: k.totalServices,
    servicesWithActualDate: k.servicesCompleted,
    feedbackChart: chartSource.fb.map((x) => ({ name: x.n || '—', value: Number(x.v) || 0 })),
    servicesByMonthChart: chartSource.dy.map((x) => ({
      month: formatMonthLabel(x.m),
      created: Number(x.c) || 0,
      completed: Number(x.d) || 0,
    })),
  };
}

export function hasAnalyticsFilters(filters: RbAnalyticsFilters): boolean {
  return !!(
    filters.nationality ||
    filters.gender ||
    filters.age ||
    filters.team ||
    filters.category ||
    filters.month ||
    filters.feedback
  );
}

export function rowVal(row: unknown, ...keys: string[]): unknown {
  if (row == null) return undefined;
  if (Array.isArray(row)) return row[0];
  if (typeof row !== 'object') return undefined;
  const o = row as Record<string, unknown>;
  for (const k of keys) {
    if (k in o && o[k] != null) return o[k];
  }
  const lower = new Map<string, unknown>();
  for (const k of Object.keys(o)) {
    lower.set(k.toLowerCase(), o[k]);
  }
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v != null) return v;
  }
  return undefined;
}

export function normStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}
