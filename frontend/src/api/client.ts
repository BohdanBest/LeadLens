const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1";

export class ApiError extends Error {
  status: number;
  title: string;
  detail?: string;

  constructor(status: number, title: string, detail?: string) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  userId: string;
  email: string;
  workspaceId: string;
}

export interface AuthSessionDto {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  isCurrent: boolean;
}

export interface QuotaSummary {
  monthlyAuditsUsed: number;
  monthlyAuditQuota: number;
  activeCampaigns: number;
  maxConcurrentCampaigns: number;
}

export interface WorkspaceDto {
  id: string;
  name: string;
  siteUrl: string | null;
  portfolioUrl: string | null;
  services: string[];
  signature: string;
  defaultEmailLanguage: "uk" | "en";
  defaultEmailTone: "formal" | "friendly";
  uiTheme: "light" | "dark" | "system";
  uiLanguage: "uk" | "en";
  quotas: QuotaSummary;
}

export interface UpdateWorkspacePayload {
  name: string;
  siteUrl?: string | null;
  portfolioUrl?: string | null;
  services: string[];
  signature: string;
  defaultEmailLanguage: "uk" | "en";
  defaultEmailTone: "formal" | "friendly";
  uiTheme: "light" | "dark" | "system";
  uiLanguage: "uk" | "en";
}

export interface CampaignProgress {
  campaignId: string;
  status: string;
  found: number;
  reachable: number;
  audited: number;
  failed: number;
  excluded: number;
}

export interface CampaignSite {
  id: string;
  domain: string;
  url: string;
  businessName: string | null;
  source: string;
  isDuplicateAcrossAccount: boolean;
  status: string;
  needScore: number | null;
  level: string | null;
  leadStatus: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  niche: string;
  region: string | null;
  searchLanguage: string;
  siteLimit: number;
  profileKey: string;
  profileVersion: number;
  status: string;
  isArchived: boolean;
  sitesFound: number;
  sitesAudited: number;
  sitesFailed: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDetail {
  id: string;
  name: string;
  niche: string;
  region: string | null;
  searchLanguage: string;
  siteLimit: number;
  exclusionKeywords: string[];
  profileKey: string;
  profileVersion: number;
  status: string;
  isArchived: boolean;
  progress: CampaignProgress;
  averageNeedScore: number | null;
  needDistribution: {
    healthy: number;
    moderate: number;
    weak: number;
    critical: number;
  };
  sites: CampaignSite[];
  createdAt: string;
  updatedAt: string;
}

export interface PagedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateCampaignPayload {
  name: string;
  niche: string;
  region?: string | null;
  searchLanguage: "uk" | "en";
  siteLimit: number;
  exclusionKeywords: string[];
  sourceType: "OpenStreetMap" | "ManualList" | "CsvImport";
  manualUrls?: string[];
  csvContent?: string;
  startImmediately: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  profilesLoaded: number;
}

export interface ContactDto {
  id: string;
  kind: "Email" | "Phone" | "ContactForm";
  value: string;
  sourcePage: string | null;
  isManual: boolean;
}

export interface EvidenceDto {
  id: string;
  kind: "Metric" | "Screenshot" | "HtmlSnippet";
  fileRef: string | null;
  payloadJson: string | null;
}

export interface FindingDto {
  id: string;
  checkId: string;
  category: string;
  titleUk: string;
  titleEn: string;
  descriptionUk: string;
  descriptionEn: string;
  result: "Pass" | "Warning" | "Fail" | "Unavailable" | "NotApplicable";
  value: string | null;
  impact: number;
  effort: number;
  service: string;
  scoreContribution: number;
  evidences: EvidenceDto[];
}

export interface CategoryComparisonDto {
  category: string;
  nameUk: string;
  nameEn: string;
  siteScore: number;
  campaignMedianScore: number | null;
}

export interface SiteReportDto {
  siteId: string;
  domain: string;
  url: string;
  auditId: string;
  auditVersion: number;
  auditedAt: string | null;
  auditStatus: string;
  needScore: number;
  level: string;
  coverageRatio: number;
  summary: string;
  campaignMedianScore: number | null;
  categoryComparisons: CategoryComparisonDto[];
  findings: FindingDto[];
  contacts: ContactDto[];
  desktopScreenshotRef?: string | null;
  mobileScreenshotRef?: string | null;
}

export interface LeadListItemDto {
  id: string;
  campaignId: string;
  campaignName: string;
  domain: string;
  url: string;
  businessName: string | null;
  needScore: number | null;
  level: string | null;
  status: string;
  leadStatus: string;
  noContactsFound: boolean;
  tags: string[];
  createdAt: string;
}

export interface LeadEventDto {
  id: string;
  type: string;
  note: string | null;
  dueAt: string | null;
  createdAt: string;
}

export interface LeadDetailDto {
  id: string;
  campaignId: string;
  campaignName: string;
  domain: string;
  url: string;
  businessName: string | null;
  source: string;
  isDuplicateAcrossAccount: boolean;
  status: string;
  needScore: number | null;
  level: string | null;
  leadStatus: string;
  noContactsFound: boolean;
  tags: string[];
  contacts: ContactDto[];
  events: LeadEventDto[];
  latestAuditId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailClaimDto {
  id: string;
  findingId: string | null;
  checkId: string | null;
  text: string;
  verificationStatus: "Verified" | "Unverified" | "Contradicts";
}

export interface EmailDraftDto {
  id: string;
  siteId: string;
  version: number;
  language: "uk" | "en";
  tone: "formal" | "friendly";
  length: "short" | "medium";
  subject: string;
  body: string;
  status: "Draft" | "Ready" | "Sent";
  claims: EmailClaimDto[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailVerificationResultDto {
  draftId: string;
  allVerified: boolean;
  claims: EmailClaimDto[];
  warnings: string[];
}

export interface DashboardDto {
  period: "7d" | "30d" | "12m";
  totalCampaigns: number;
  totalLeads: number;
  needDistribution: {
    healthy: number;
    moderate: number;
    weak: number;
    critical: number;
  };
  statusFunnel: Record<string, number>;
  topIssues: Array<{ checkId: string; category: string; count: number }>;
  campaignAverageScores: Array<{
    campaignId: string;
    campaignName: string;
    averageScore: number;
    leadsCount: number;
  }>;
}

export interface ReportShareLinkDto {
  id: string;
  token: string;
  expiresAt: string;
  publicPath: string;
}

export interface PublicReportDto {
  domain: string;
  url: string;
  auditVersion: number;
  auditedAt: string | null;
  needScore: number;
  level: string;
  summary: string;
  topFindings: Array<{
    checkId: string;
    category: string;
    titleUk: string;
    titleEn: string;
    result: string;
    value: string | null;
    scoreContribution: number;
  }>;
}

type TokenProvider = () => {
  accessToken: string | null;
  onTokensUpdated: (auth: AuthResponse) => void;
  onAuthCleared: () => void;
};

let tokenProvider: TokenProvider | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function registerTokenProvider(provider: TokenProvider) {
  tokenProvider = provider;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { title?: string; detail?: string };
    return new ApiError(response.status, data.title || response.statusText, data.detail);
  } catch {
    return new ApiError(response.status, response.statusText || "Request failed");
  }
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (!tokenProvider) return null;
  const { onTokensUpdated, onAuthCleared } = tokenProvider();

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          onAuthCleared();
          return null;
        }
        const auth = (await res.json()) as AuthResponse;
        onTokensUpdated(auth);
        return auth.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

async function rawAuthorizedFetch(path: string, init: RequestInit = {}, authRequired = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authRequired && tokenProvider) {
    const { accessToken } = tokenProvider();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && authRequired) {
    const nextToken = await tryRefreshAccessToken();
    if (nextToken) {
      headers.set("Authorization", `Bearer ${nextToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return response;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, authRequired = true): Promise<T> {
  const response = await rawAuthorizedFetch(path, init, authRequired);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await rawAuthorizedFetch(path, {}, true);
  return response.blob();
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  health: () => apiFetch<HealthResponse>("/health", {}, false),
  register: (email: string, password: string, studioName?: string) =>
    apiFetch<AuthResponse>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ email, password, studioName }) },
      false
    ),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false
    ),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }, false),
  logoutAll: () => apiFetch<void>("/auth/logout-all", { method: "POST" }),
  refreshSession: () => apiFetch<AuthResponse>("/auth/refresh", { method: "POST" }, false),
  listSessions: () => apiFetch<AuthSessionDto[]>("/auth/sessions"),
  revokeSession: (sessionId: string) =>
    apiFetch<void>(`/auth/sessions/${sessionId}`, { method: "DELETE" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<AuthResponse>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  deleteAccount: () => apiFetch<void>("/auth/account", { method: "DELETE" }),
  getWorkspace: () => apiFetch<WorkspaceDto>("/workspace"),
  updateWorkspace: (payload: UpdateWorkspacePayload) =>
    apiFetch<WorkspaceDto>("/workspace", { method: "PUT", body: JSON.stringify(payload) }),
  listCampaigns: (includeArchived = false) =>
    apiFetch<PagedResponse<CampaignSummary>>(`/campaigns?includeArchived=${includeArchived}`),
  createCampaign: (payload: CreateCampaignPayload) =>
    apiFetch<CampaignDetail>("/campaigns", { method: "POST", body: JSON.stringify(payload) }),
  getCampaign: (id: string) => apiFetch<CampaignDetail>(`/campaigns/${id}`),
  getCampaignProgress: (id: string) => apiFetch<CampaignProgress>(`/campaigns/${id}/progress`),
  pauseCampaign: (id: string) => apiFetch<CampaignProgress>(`/campaigns/${id}/pause`, { method: "POST" }),
  resumeCampaign: (id: string) => apiFetch<CampaignProgress>(`/campaigns/${id}/resume`, { method: "POST" }),
  retryCampaign: (id: string) => apiFetch<CampaignProgress>(`/campaigns/${id}/retry`, { method: "POST" }),
  cancelCampaign: (id: string) => apiFetch<CampaignProgress>(`/campaigns/${id}/cancel`, { method: "POST" }),
  duplicateCampaign: (id: string) => apiFetch<CampaignDetail>(`/campaigns/${id}/duplicate`, { method: "POST" }),
  archiveCampaign: (id: string) => apiFetch<void>(`/campaigns/${id}/archive`, { method: "POST" }),
  unarchiveCampaign: (id: string) => apiFetch<void>(`/campaigns/${id}/unarchive`, { method: "POST" }),
  deleteCampaign: (id: string) => apiFetch<void>(`/campaigns/${id}`, { method: "DELETE" }),

  // Reports & Contacts (M7, M8)
  getSiteReport: (leadId: string, version?: number) =>
    apiFetch<SiteReportDto>(`/leads/${leadId}/report${version ? `?version=${version}` : ""}`),
  downloadReportPdf: (leadId: string, lang: string, version?: number) => {
    const qs = new URLSearchParams({ lang });
    if (version) qs.set("version", String(version));
    return apiFetchBlob(`/leads/${leadId}/report.pdf?${qs.toString()}`);
  },
  reauditSite: (leadId: string) =>
    apiFetch<{ siteId: string; status: string }>(`/leads/${leadId}/audit`, { method: "POST" }),
  fetchArtifactBlob: (key: string) => apiFetchBlob(`/artifacts/${key}`),
  createContact: (leadId: string, payload: { kind: string; value: string; sourcePage?: string }) =>
    apiFetch<ContactDto>(`/leads/${leadId}/contacts`, { method: "POST", body: JSON.stringify(payload) }),
  updateContact: (
    leadId: string,
    contactId: string,
    payload: { kind: string; value: string; sourcePage?: string }
  ) =>
    apiFetch<ContactDto>(`/leads/${leadId}/contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteContact: (leadId: string, contactId: string) =>
    apiFetch<void>(`/leads/${leadId}/contacts/${contactId}`, { method: "DELETE" }),

  // Emails (M9)
  listEmails: (leadId: string) => apiFetch<EmailDraftDto[]>(`/leads/${leadId}/emails`),
  generateEmail: (
    leadId: string,
    payload: { findingIds?: string[]; language?: "uk" | "en"; tone?: "formal" | "friendly"; length?: "short" | "medium" }
  ) => apiFetch<EmailDraftDto>(`/leads/${leadId}/emails/generate`, { method: "POST", body: JSON.stringify(payload) }),
  updateEmail: (
    emailId: string,
    payload: { subject: string; body: string; claims: Array<{ id?: string | null; findingId?: string | null; text: string }> }
  ) => apiFetch<EmailDraftDto>(`/emails/${emailId}`, { method: "PUT", body: JSON.stringify(payload) }),
  verifyEmail: (emailId: string) =>
    apiFetch<EmailVerificationResultDto>(`/emails/${emailId}/verify`, { method: "POST" }),
  downloadEml: (emailId: string) => apiFetchBlob(`/emails/${emailId}/eml`),
  markEmailSent: (emailId: string) =>
    apiFetch<EmailDraftDto>(`/emails/${emailId}/mark-sent`, { method: "POST" }),

  // Leads CRM (M10)
  listLeads: (params: {
    search?: string;
    level?: string;
    leadStatus?: string;
    campaignId?: string;
    tag?: string;
    sortBy?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.level) qs.set("level", params.level);
    if (params.leadStatus) qs.set("leadStatus", params.leadStatus);
    if (params.campaignId) qs.set("campaignId", params.campaignId);
    if (params.tag) qs.set("tag", params.tag);
    if (params.sortBy) qs.set("sortBy", params.sortBy);
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.limit) qs.set("limit", String(params.limit));
    return apiFetch<PagedResponse<LeadListItemDto>>(`/leads?${qs.toString()}`);
  },
  getLead: (id: string) => apiFetch<LeadDetailDto>(`/leads/${id}`),
  updateLeadStatus: (id: string, leadStatus: string, note?: string) =>
    apiFetch<{ id: string; leadStatus: string }>(`/leads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ leadStatus, note }),
    }),
  bulkUpdateLeadStatus: (leadIds: string[], leadStatus: string) =>
    apiFetch<{ updatedCount: number; leadStatus: string }>("/leads/bulk-status", {
      method: "PATCH",
      body: JSON.stringify({ leadIds, leadStatus }),
    }),
  updateLeadTags: (id: string, tags: string[]) =>
    apiFetch<{ id: string; tags: string[] }>(`/leads/${id}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    }),
  createLeadEvent: (id: string, payload: { type: "Note" | "Reminder"; note: string; dueAt?: string | null }) =>
    apiFetch<LeadEventDto>(`/leads/${id}/events`, { method: "POST", body: JSON.stringify(payload) }),
  exportLeadsCsv: (campaignId?: string) =>
    apiFetchBlob(`/leads/export.csv${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ""}`),

  // Dashboard (M11)
  getDashboard: (period: "7d" | "30d" | "12m") => apiFetch<DashboardDto>(`/dashboard?period=${period}`),

  // Public share links (FR-RPT-07)
  createShareLink: (leadId: string, version?: number) =>
    apiFetch<ReportShareLinkDto>(
      `/leads/${leadId}/report/share${version ? `?version=${version}` : ""}`,
      { method: "POST" }
    ),
  revokeShareLink: (leadId: string, linkId: string) =>
    apiFetch<void>(`/leads/${leadId}/report/share/${linkId}`, { method: "DELETE" }),
  getPublicReport: (token: string) =>
    apiFetch<PublicReportDto>(`/public/reports/${encodeURIComponent(token)}`, {}, false),
};
