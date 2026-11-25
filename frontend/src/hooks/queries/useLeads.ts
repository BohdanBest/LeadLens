import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { type LeadsFilterParams, queryKeys } from "@/api/queryKeys";

export function useInfiniteLeads(filters: LeadsFilterParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.leads(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.listLeads({
        search: filters.search || undefined,
        level: filters.level || undefined,
        leadStatus: filters.leadStatus || undefined,
        campaignId: filters.campaignId || undefined,
        tag: filters.tag || undefined,
        sortBy: filters.sortBy || "score_desc",
        cursor: pageParam,
        limit: 25,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
  });
}

export function useBulkUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadIds, leadStatus }: { leadIds: string[]; leadStatus: string }) =>
      api.bulkUpdateLeadStatus(leadIds, leadStatus),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
