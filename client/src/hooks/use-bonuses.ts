import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useBonusBalance() {
  return useQuery({
    queryKey: ["/api/customer/bonuses/balance"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/customer/bonuses/balance");
      const data = await res.json();
      return data.balance as number;
    },
    retry: false,
    staleTime: 30000, // 30 секунд
  });
}

export function useBonusTransactions(limit: number = 50) {
  return useQuery({
    queryKey: ["/api/customer/bonuses/transactions", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customer/bonuses/transactions?limit=${limit}`);
      return res.json();
    },
    retry: false,
    staleTime: 30000,
  });
}

export function useSpendBonus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payload: { amount: number; description?: string }) => {
      const res = await apiRequest("POST", "/api/customer/bonuses/spend", payload);
      return res.json();
    },
    onSuccess: () => {
      // Инвалидировать данные баланса после успешного списания
      queryClient.invalidateQueries({ queryKey: ["/api/customer/bonuses/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/bonuses/transactions"] });
    },
  });
}
