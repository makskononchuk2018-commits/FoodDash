import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useAnalytics() {
  return useQuery({
    queryKey: [api.analytics.summary.path],
    queryFn: async () => {
      const res = await fetch(api.analytics.summary.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return api.analytics.summary.responses[200].parse(await res.json());
    },
  });
}

export function useAnalyticsExport() {
  return {
    exportData: async () => {
      window.location.href = api.analytics.export.path;
    },
  };
}
