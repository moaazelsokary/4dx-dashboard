/** Sync / warehouse metadata (from rb_sync_metadata). */
export type RbSyncMeta = {
  lastSyncAt: string | null;
  lastDurationMs: number | null;
  rowsCases: number | null;
  rowsServices: number | null;
  rowsIndividuals: number | null;
  lastJobId: number | null;
  updatedAt: string | null;
};

export type RbSummaryResponse = {
  ok: boolean;
  meta: RbSyncMeta | null;
  kpis: {
    totalIndividuals: number;
    totalServices: number;
    primaryCases: number;
    servicesCompleted: number;
  };
};

export type RbChartsResponse = {
  ok: boolean;
  fb: { n: string; v: number }[];
  dy: { m: string; c: number; d: number }[];
};

export type RbSearchHit = {
  id: string;
  iid?: string;
  mn?: string | null;
  cn?: string | null;
  rt?: string | null;
  og?: string | null;
  st?: string | null;
  cc?: string | null;
  mf?: string | null;
  nt?: string | null;
};

export type RbSearchResponse = {
  ok: boolean;
  r: RbSearchHit[];
};

export type RbProfileHouseholdRow = {
  iid: string;
  rt: string | null;
  nm: string | null;
  cc: string | null;
  nid: string | null;
  pin: string | null;
  fn: string | null;
  nat: string | null;
  gen: string | null;
  age: number | null;
  onat?: string | null;
  ft?: string | null;
  tm?: string | null;
  og?: string | null;
  cd: string | null;
};

export type RbProfileResponse = {
  ok: boolean;
  id: string;
  hc: number;
  hh: RbProfileHouseholdRow[];
};

export type RbServiceRow = {
  sid: string;
  pn: string | null;
  cat: string | null;
  fb: string | null;
  cd: string | null;
  ad: string | null;
  ed?: string | null;
  lu?: string | null;
  rcv?: string | null;
  ist: string | null;
  amt?: number | null;
  qty: number | null;
  tn: string[];
};

export type RbTimelineItem = {
  ts: string | null;
  ty: string;
  de: string | null;
};

export type RbKeysetPage<T> = {
  ok: boolean;
  it: T[];
  nc: string | null;
  hm: boolean;
};

export type RbSyncJobRow = {
  id: string;
  st: string;
  sg: string | null;
  er: string | null;
  du: number | null;
  ri: number | null;
  rs: number | null;
  ca: string | null;
  sa: string | null;
  fa: string | null;
};

export type RbSyncJobResponse = { ok: true; j: RbSyncJobRow } | { ok: false; err: string };

export type RbDashboardStats = {
  totalPrimaryCases: number;
  totalIndividuals: number;
  totalServices: number;
  servicesWithActualDate: number;
  feedbackChart: { name: string; value: number }[];
  servicesByMonthChart: { month: string; created: number; completed: number }[];
};

export type RbAnalyticsSlice = { label: string; value: number };
export type RbAnalyticsTeamRow = { label: string; cases: number; services: number };
export type RbAnalyticsCategoryRow = { label: string; cases: number; services: number };

export type RbAnalyticsFilters = {
  nationality?: string | null;
  gender?: string | null;
  age?: string | null;
  team?: string | null;
};

export type RbAnalyticsResponse = {
  ok: boolean;
  nationality: RbAnalyticsSlice[];
  gender: RbAnalyticsSlice[];
  age: RbAnalyticsSlice[];
  teams: RbAnalyticsTeamRow[];
  categories: RbAnalyticsCategoryRow[];
  filters?: RbAnalyticsFilters;
};

export type RbCategoryProductsResponse = {
  ok: boolean;
  category: string;
  mode: 'cases' | 'services';
  products: RbAnalyticsCategoryRow[];
};
