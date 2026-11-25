import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/stores/useAuthStore";

export function useAuthSessions(enabled = true) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.session));
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.listSessions(),
    enabled: isAuthenticated && enabled,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.revokeSession(sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}
