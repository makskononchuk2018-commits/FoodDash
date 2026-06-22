import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CourierStats, OrderWithItems, OrderStatus } from "@shared/schema";

export function useCourierAvailableOrders() {
  return useQuery<OrderWithItems[]>({
    queryKey: ["/api/courier/orders/available"],
    queryFn: async () => {
      const res = await fetch("/api/courier/orders/available", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить доступные заказы");
      return res.json();
    },
    refetchInterval: 15000,
  });
}

export function useCourierActiveOrders() {
  return useQuery<OrderWithItems[]>({
    queryKey: ["/api/courier/orders/active"],
    queryFn: async () => {
      const res = await fetch("/api/courier/orders/active", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить активные заказы");
      return res.json();
    },
    refetchInterval: 10000,
  });
}

export function useAcceptCourierOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/courier/orders/${orderId}/accept`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось принять заказ" }));
        throw new Error(err.message || "Не удалось принять заказ");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/active"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
    },
  });
}

export function useCourierUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: OrderStatus }) => {
      const res = await fetch(`/api/courier/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось обновить статус" }));
        throw new Error(err.message || "Не удалось обновить статус");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/active"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
    },
  });
}

export function useCourierStats(period: "day" | "week" | "month") {
  return useQuery<CourierStats>({
    queryKey: ["/api/courier/stats", period],
    queryFn: async () => {
      const res = await fetch(`/api/courier/stats?period=${period}`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить статистику");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export type CourierScheduleItem = {
  id: number;
  dayOfWeek: string;
  timeSlots: string[];
};

export function useCourierSchedule() {
  return useQuery<CourierScheduleItem[]>({
    queryKey: ["/api/courier/schedule"],
    queryFn: async () => {
      const res = await fetch("/api/courier/schedule", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить график");
      return res.json();
    },
  });
}

export function useUpdateCourierSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { dayOfWeek: string; timeSlots: string[] }) => {
      const res = await fetch("/api/courier/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Ошибка сохранения графика" }));
        throw new Error(err.message || "Ошибка сохранения графика");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/schedule"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/courier-schedule"] });
    },
  });
}
