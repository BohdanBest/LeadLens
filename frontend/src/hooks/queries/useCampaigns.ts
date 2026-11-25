import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CreateCampaignPayload } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";

export function useCampaigns(includeArchived: boolean) {
  return useQuery({
    queryKey: queryKeys.campaigns(includeArchived),
    queryFn: () => api.listCampaigns(includeArchived),
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCampaignPayload) => api.createCampaign(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: queryKeys.workspace });
    },
  });
}

export function useCampaignListActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["campaigns"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const duplicate = useMutation({
    mutationFn: (id: string) => api.duplicateCampaign(id),
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? api.unarchiveCampaign(id) : api.archiveCampaign(id),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCampaign(id),
    onSuccess: invalidate,
  });

  return { duplicate, archive, remove };
}
