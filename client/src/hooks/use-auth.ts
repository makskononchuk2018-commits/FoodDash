import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@shared/schema";

export function useAuth() {
  return useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });

      if (res.status === 401) {
        return null;
      }

      if (!res.ok) {
        throw new Error("Не удалось получить данные сессии");
      }

      const data = (await res.json()) as { user: AuthUser };
      return data.user;
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { username: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Ошибка авторизации" }));
        throw new Error(error.message || "Ошибка авторизации");
      }

      return (await res.json()) as { user: AuthUser };
    },
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      // Clear all queries when user changes
      await queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useRegisterCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      username: string;
      password: string;
      fullName: string;
      phone: string;
      email?: string | null;
    }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Ошибка регистрации" }));
        throw new Error(error.message || "Ошибка регистрации");
      }

      return (await res.json()) as { user: AuthUser };
    },
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useCourierApplication() {
  return useMutation({
    mutationFn: async (payload: {
      fullName: string;
      phone: string;
      email?: string | null;
      experience?: string | null;
      comment?: string | null;
    }) => {
      const res = await fetch("/api/auth/courier-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Не удалось отправить заявку" }));
        throw new Error(error.message || "Не удалось отправить заявку");
      }

      return res.json();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: async () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      // Clear all queries when user logs out
      await queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}
