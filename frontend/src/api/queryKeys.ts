export interface LeadsFilterParams {
  search?: string;
  level?: string;
  leadStatus?: string;
  campaignId?: string;
  tag?: string;
  sortBy?: string;
}

export const queryKeys = {
  workspace: ["workspace"] as const,
  sessions: ["auth", "sessions"] as const,
  dashboard: (period: "7d" | "30d" | "12m") => ["dashboard", period] as const,
  campaigns: (includeArchived: boolean) => ["campaigns", { includeArchived }] as const,
  campaign: (id: string) => ["campaign", id] as const,
  leads: (filters: LeadsFilterParams) => ["leads", filters] as const,
  lead: (id: string) => ["lead", id] as const,
  siteReport: (leadId: string, version?: number) => ["siteReport", leadId, version ?? "latest"] as const,
  emails: (leadId: string) => ["emails", leadId] as const,
  publicReport: (token: string) => ["publicReport", token] as const,
};
