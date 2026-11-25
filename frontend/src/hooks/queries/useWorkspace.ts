import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type UpdateWorkspacePayload } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/stores/useAuthStore";

export function useWorkspace() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.session));
  return useQuery({
    queryKey: queryKeys.workspace,
    queryFn: () => api.getWorkspace(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateWorkspacePayload) => api.updateWorkspace(payload),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.workspace, updated);
    },
  });
}
