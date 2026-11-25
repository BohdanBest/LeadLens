import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";

export function useCampaignDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.campaign(id ?? ""),
    queryFn: () => api.getCampaign(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "Discovering" || status === "Auditing" ? 2500 : false;
    },
  });
}

export function useCampaignControls(id: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    if (id) void qc.invalidateQueries({ queryKey: queryKeys.campaign(id) });
    void qc.invalidateQueries({ queryKey: ["campaigns"] });
    void qc.invalidateQueries({ queryKey: queryKeys.workspace });
  };

  const pause = useMutation({ mutationFn: () => api.pauseCampaign(id!), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => api.resumeCampaign(id!), onSuccess: invalidate });
  const retry = useMutation({ mutationFn: () => api.retryCampaign(id!), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => api.cancelCampaign(id!), onSuccess: invalidate });

  return { pause, resume, retry, cancel };
}
