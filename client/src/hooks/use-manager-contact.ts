import { useQuery } from "@tanstack/react-query";
import type { ManagerContact } from "@shared/schema";

export function usePublicManagerContact() {
  return useQuery<ManagerContact | null>({
    queryKey: ["/api/public/manager-contact"],
    queryFn: async () => {
      const res = await fetch("/api/public/manager-contact", { credentials: "include" });
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) throw new Error("Не удалось загрузить контакт менеджера");
      return res.json();
    },
  });
}
