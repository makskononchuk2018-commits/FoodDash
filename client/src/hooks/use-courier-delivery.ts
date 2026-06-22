import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CourierDeliveryWithItems = {
  id: number;
  courierId: number;
  orderId: number;
  deliverySequence: number;
  status: string;
  pickupLatitude: string | null;
  pickupLongitude: string | null;
  deliveryAddress: string;
  deliveryLatitude: string | null;
  deliveryLongitude: string | null;
  notes: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order: {
    id: number;
    customerId: number;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    totalAmount: string;
    status: string;
    channel: string;
  };
  items: Array<{
    id: number;
    orderId: number;
    productId: number;
    quantity: number;
    price: string;
    product?: {
      id: number;
      name: string;
      price: string;
      imageUrl?: string | null;
    } | null;
  }>;
};

export function useAvailableCourierOrders() {
  return useQuery({
    queryKey: ["/api/courier/orders/available"],
    queryFn: async () => {
      const res = await fetch("/api/courier/orders/available", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить доступные заказы");
      return res.json();
    },
    refetchInterval: 10000,
  });
}

export function useActiveDeliveries() {
  return useQuery({
    queryKey: ["/api/courier/active-deliveries"],
    queryFn: async () => {
      const res = await fetch("/api/courier/active-deliveries", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить активные доставки");
      return res.json() as Promise<CourierDeliveryWithItems[]>;
    },
    refetchInterval: 10000,
  });
}

export function useCourierDeliveries() {
  return useQuery({
    queryKey: ["/api/courier/deliveries"],
    queryFn: async () => {
      const res = await fetch("/api/courier/deliveries", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить доставки");
      return res.json();
    },
    refetchInterval: 15000,
  });
}

export function useAcceptDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch("/api/courier/delivery/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось принять заказ" }));
        throw new Error(err.message || "Не удалось принять заказ");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/active-deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
    },
  });
}

export function useUpdateDeliverySequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, newSequence }: { id: number; newSequence: number }) => {
      const res = await fetch(`/api/courier/delivery/${id}/sequence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newSequence }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось обновить порядок" }));
        throw new Error(err.message || "Не удалось обновить порядок");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/active-deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
    },
  });
}

export function useUpdateDeliveryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/courier/delivery/${id}/status`, {
        method: "PUT",
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
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/active-deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
    },
  });
}

export function useRemoveOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deliveryId,
      itemId,
      reasonKey,
      reasonDetails,
    }: {
      deliveryId: number;
      itemId: number;
      reasonKey: string;
      reasonDetails: string;
    }) => {
      const res = await fetch(`/api/courier/delivery/${deliveryId}/items/${itemId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reasonKey, reasonDetails }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось удалить товар" }));
        throw new Error(err.message || "Не удалось удалить товар");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/active-deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
    },
  });
}

export function useCancelDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      reasonKey,
      reasonDetails,
    }: {
      id: number;
      reasonKey: string;
      reasonDetails: string;
    }) => {
      const res = await fetch(`/api/courier/delivery/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled", reasonKey, reasonDetails }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось отменить доставку" }));
        throw new Error(err.message || "Не удалось отменить доставку");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/active-deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/deliveries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/courier/orders/available"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/summary"] });
    },
  });
}
