import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type CreateOrderRequest, type OrderStatus, type OrderWithItems } from "@shared/schema";

export function useOrders() {
  return useQuery<OrderWithItems[]>({
    queryKey: [api.orders.list.path],
    queryFn: async () => {
      const res = await fetch(api.orders.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось получить заказы");
      return res.json();
    },
  });
}

export function useAdminOrders() {
  return useQuery<any[]>({
    queryKey: ["/api/admin/orders"],
    queryFn: async () => {
      const res = await fetch("/api/admin/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось получить заказы");
      return res.json();
    },
  });
}

export type CourierAssignmentItem = {
  id: number;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  activeDeliveries: number;
  isAvailable: boolean;
};

export function useCouriersList() {
  return useQuery<CourierAssignmentItem[]>({
    queryKey: ["/api/admin/couriers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/couriers", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить курьеров");
      return res.json();
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateOrderRequest) => {
      const validated = api.orders.create.input.parse(data);
      const res = await fetch(api.orders.create.path, {
        method: api.orders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось создать заказ" }));
        throw new Error(error.message || "Не удалось создать заказ");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: OrderStatus }) => {
      const url = buildUrl(api.orders.updateStatus.path, { id });
      const res = await fetch(url, {
        method: api.orders.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось обновить статус заказа" }));
        throw new Error(error.message || "Не удалось обновить статус заказа");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.analytics.summary.path] });
    },
  });
}

export function useReassignOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, courierId, deliverySequence }: { orderId: number; courierId: number; deliverySequence?: number }) => {
      const res = await fetch(`/api/admin/orders/${orderId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId, deliverySequence }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось переназначить заказ" }));
        throw new Error(error.message || "Не удалось переназначить заказ");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/couriers"] });
    },
  });
}

export function useUnassignOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/admin/orders/${orderId}/unassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось снять курьера" }));
        throw new Error(error.message || "Не удалось снять курьера");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/couriers"] });
    },
  });
}

export function useUpdateAdminDeliverySequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, newSequence }: { deliveryId: number; newSequence: number }) => {
      const res = await fetch(`/api/admin/courier-deliveries/${deliveryId}/sequence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newSequence }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось изменить порядок доставки" }));
        throw new Error(error.message || "Не удалось изменить порядок доставки");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/couriers"] });
    },
  });
}

export function useOrderItems(orderId: number) {
  return useQuery<any>({
    queryKey: [`/api/admin/order-items/${orderId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/order-items/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить товары");
      return res.json();
    },
  });
}

export function useRemoveOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, orderItemId, reason }: { orderId: number; orderItemId: number; reason?: string }) => {
      const res = await fetch(`/api/admin/order-items/${orderId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId, reason }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось удалить товар" }));
        throw new Error(error.message || "Не удалось удалить товар");
      }

      return res.json();
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/order-items/${orderId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.analytics.summary.path] });
    },
  });
}

export function useOrderCancellation(orderId: number) {
  return useQuery<any>({
    queryKey: [`/api/admin/order-cancellations/${orderId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/order-cancellations/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить информацию об отмене");
      return res.json();
    },
  });
}

export function useDeliveryReasons() {
  return useQuery<any[]>({
    queryKey: ["/api/admin/delivery-reasons"],
    queryFn: async () => {
      const res = await fetch("/api/admin/delivery-reasons", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить причины");
      return res.json();
    },
  });
}
