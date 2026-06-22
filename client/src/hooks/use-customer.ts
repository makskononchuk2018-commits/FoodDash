import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerOrderHistoryItem, OrderEvent } from "@shared/schema";

export function useCustomerOrders(enabled = true) {
  return useQuery<CustomerOrderHistoryItem[]>({
    queryKey: ["/api/customer/orders"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/customer/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить историю заказов");
      return res.json();
    },
  });
}

export function useRepeatOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/customer/orders/${orderId}/repeat`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось повторить заказ" }));
        throw new Error(err.message || "Не удалось повторить заказ");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/customer/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось удалить заказ" }));
        throw new Error(err.message || "Не удалось удалить заказ");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
    },
  });
}

export function useCustomerSavedAddresses(enabled = true) {
  return useQuery<{ id: number; address: string; isDefault: boolean }[]>({
    queryKey: ["/api/customer/saved-addresses"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/customer/saved-addresses", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить адреса");
      return res.json();
    },
  });
}

export function useOrderTimeline(orderId: number | null) {
  return useQuery<OrderEvent[]>({
    queryKey: ["/api/customer/orders", orderId, "timeline"],
    enabled: !!orderId,
    queryFn: async () => {
      const res = await fetch(`/api/customer/orders/${orderId}/timeline`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить таймлайн заказа");
      return res.json();
    },
    refetchInterval: 20000,
  });
}

export function subscribeOrderEvents(orderId: number, onEvent: (event: OrderEvent) => void) {
  const source = new EventSource(`/api/customer/orders/${orderId}/events/stream`, {
    withCredentials: true,
  });

  source.addEventListener("order_event", (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as OrderEvent;
      onEvent(parsed);
    } catch {
      // no-op
    }
  });

  return () => source.close();
}

export interface CourierLocation {
  id: number;
  courierId: number;
  orderId?: number | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
}

export type CancellationReason = {
  reasonKey: string;
  reasonText: string;
  category: string;
};

export function useCourierLocation(orderId: number | null) {
  return useQuery<CourierLocation | null>({
    queryKey: ["/api/orders", orderId, "courier-location"],
    enabled: !!orderId,
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/courier-location`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить GPS позицию");
      return res.json();
    },
    refetchInterval: 10000,
  });
}

export function useCancellationReasons(role?: string) {
  return useQuery<CancellationReason[]>({
    queryKey: ["/api/orders/cancellation-reasons", role],
    queryFn: async () => {
      const query = role ? `?role=${role}` : "";
      const res = await fetch(`/api/orders/cancellation-reasons${query}`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить причины отмены");
      return res.json();
    },
  });
}

export function useOrderCancellation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      reasonKey,
      reasonDetails,
    }: {
      orderId: number;
      reasonKey: string;
      reasonDetails?: string;
    }) => {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reasonKey, reasonDetails }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось отменить заказ" }));
        throw new Error(err.message || "Не удалось отменить заказ");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
    },
  });
}
