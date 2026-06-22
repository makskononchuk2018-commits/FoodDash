import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserListItem, ManagerContact, UserRole } from "@shared/schema";

export type CourierApplicationListItem = {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  experience: string | null;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  adminComment: string | null;
  reviewedById: number | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: {
    id: number;
    fullName: string;
    username: string;
  } | null;
};

export function useAdminUsers(filters: { role?: UserRole; status?: "active" | "deleted" | "all"; search?: string }) {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);

  const query = params.toString();
  const url = query ? `/api/admin/users?${query}` : "/api/admin/users";

  return useQuery<AdminUserListItem[]>({
    queryKey: ["/api/admin/users", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить пользователей");
      return res.json();
    },
  });
}

export function useCreateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      username: string;
      password: string;
      role: UserRole;
      fullName: string;
      email?: string | null;
      phone?: string | null;
    }) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Ошибка создания пользователя" }));
        throw new Error(err.message || "Ошибка создания пользователя");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; [key: string]: unknown }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Ошибка обновления пользователя" }));
        throw new Error(err.message || "Ошибка обновления пользователя");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Ошибка удаления пользователя" }));
        throw new Error(err.message || "Ошибка удаления пользователя");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useRestoreAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Ошибка восстановления пользователя" }));
        throw new Error(err.message || "Ошибка восстановления пользователя");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useCourierApplications(status?: "pending" | "approved" | "rejected" | "all") {
  const query = status && status !== "all" ? `?status=${status}` : "";

  return useQuery<CourierApplicationListItem[]>({
    queryKey: ["/api/admin/courier-applications", status || "all"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/courier-applications${query}`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить заявки курьеров");
      return res.json();
    },
  });
}

export function useApproveCourierApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      username,
      password,
      adminComment,
    }: {
      id: number;
      username: string;
      password: string;
      adminComment?: string | null;
    }) => {
      const res = await fetch(`/api/admin/courier-applications/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, adminComment }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось одобрить заявку" }));
        throw new Error(err.message || "Не удалось одобрить заявку");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/courier-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useRejectCourierApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, adminComment }: { id: number; adminComment?: string | null }) => {
      const res = await fetch(`/api/admin/courier-applications/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adminComment }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Не удалось отклонить заявку" }));
        throw new Error(err.message || "Не удалось отклонить заявку");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/courier-applications"] });
    },
  });
}

export function useManagerContactAdmin() {
  return useQuery<ManagerContact | null>({
    queryKey: ["/api/admin/manager-contact"],
    queryFn: async () => {
      const res = await fetch("/api/admin/manager-contact", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить контакт менеджера");
      return res.json();
    },
  });
}

export function useUpdateManagerContactAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { label: string; telegramUrl: string; telegramUsername?: string | null }) => {
      const res = await fetch("/api/admin/manager-contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Ошибка сохранения контакта" }));
        throw new Error(err.message || "Ошибка сохранения контакта");
      }

      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/manager-contact"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/public/manager-contact"] });
    },
  });
}

export type CourierScheduleItem = {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  schedules: Array<{
    id: number;
    dayOfWeek: string;
    timeSlots: string[];
  }>;
};

export function useAdminCourierSchedule() {
  return useQuery<CourierScheduleItem[]>({
    queryKey: ["/api/admin/courier-schedule"],
    queryFn: async () => {
      const res = await fetch("/api/admin/courier-schedule", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить графики курьеров");
      return res.json();
    },
    refetchInterval: 60000,
  });
}
