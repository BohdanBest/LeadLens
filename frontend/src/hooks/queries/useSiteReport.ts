import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";

export function useSiteReport(leadId: string | undefined, version?: number) {
  return useQuery({
    queryKey: queryKeys.siteReport(leadId ?? "", version),
    queryFn: () => api.getSiteReport(leadId!, version),
    enabled: Boolean(leadId),
  });
}

export function useLeadDetail(leadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lead(leadId ?? ""),
    queryFn: () => api.getLead(leadId!),
    enabled: Boolean(leadId),
  });
}

export function usePublicReport(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicReport(token ?? ""),
    queryFn: () => api.getPublicReport(token!),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useSiteReportMutations(leadId: string | undefined) {
  const qc = useQueryClient();
  const invalidateLeadAndReport = () => {
    if (!leadId) return;
    void qc.invalidateQueries({ queryKey: ["siteReport", leadId] });
    void qc.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const reaudit = useMutation({
    mutationFn: () => api.reauditSite(leadId!),
    onSuccess: () => {
      invalidateLeadAndReport();
      void qc.invalidateQueries({ queryKey: queryKeys.workspace });
    },
  });

  const createContact = useMutation({
    mutationFn: (payload: { kind: string; value: string; sourcePage?: string }) =>
      api.createContact(leadId!, payload),
    onSuccess: invalidateLeadAndReport,
  });

  const updateContact = useMutation({
    mutationFn: ({
      contactId,
      payload,
    }: {
      contactId: string;
      payload: { kind: string; value: string; sourcePage?: string };
    }) => api.updateContact(leadId!, contactId, payload),
    onSuccess: invalidateLeadAndReport,
  });

  const deleteContact = useMutation({
    mutationFn: (contactId: string) => api.deleteContact(leadId!, contactId),
    onSuccess: invalidateLeadAndReport,
  });

  const updateStatus = useMutation({
    mutationFn: (leadStatus: string) => api.updateLeadStatus(leadId!, leadStatus),
    onSuccess: invalidateLeadAndReport,
  });

  const updateTags = useMutation({
    mutationFn: (tags: string[]) => api.updateLeadTags(leadId!, tags),
    onSuccess: invalidateLeadAndReport,
  });

  const createEvent = useMutation({
    mutationFn: (payload: { type: "Note" | "Reminder"; note: string; dueAt?: string | null }) =>
      api.createLeadEvent(leadId!, payload),
    onSuccess: invalidateLeadAndReport,
  });

  const createShareLink = useMutation({
    mutationFn: (version?: number) => api.createShareLink(leadId!, version),
  });

  const revokeShareLink = useMutation({
    mutationFn: (linkId: string) => api.revokeShareLink(leadId!, linkId),
  });

  return {
    reaudit,
    createContact,
    updateContact,
    deleteContact,
    updateStatus,
    updateTags,
    createEvent,
    createShareLink,
    revokeShareLink,
  };
}
