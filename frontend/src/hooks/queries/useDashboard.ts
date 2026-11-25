import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";

export function useDashboard(period: "7d" | "30d" | "12m") {
  return useQuery({
    queryKey: queryKeys.dashboard(period),
    queryFn: () => api.getDashboard(period),
  });
}
