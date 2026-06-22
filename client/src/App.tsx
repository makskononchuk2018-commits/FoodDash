import { Switch, Route, Link, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Orders from "@/pages/Orders";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import CourierScheduleChartPage from "@/pages/CourierScheduleChart";
import Storefront from "@/pages/Storefront";
import AuthPage from "@/pages/AuthPage";
import CourierPage from "@/pages/CourierPage";
import CustomerAccount from "@/pages/CustomerAccount";
import NotFound from "@/pages/not-found";
import { Menu, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import React from "react";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { UserRole } from "@shared/schema";

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-muted/30">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden h-16 border-b bg-white flex items-center px-4 justify-between shrink-0">
          <span className="font-display font-bold text-lg">FoodDash Admin</span>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContentMobile />
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContentMobile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    toast({ title: "Выход выполнен", description: "До встречи" });
    setLocation("/auth");
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-8 font-display font-bold text-xl text-primary">FoodDash</div>
      <nav className="space-y-2 flex-1">
        <Link href="/admin" className="block py-2 text-lg font-medium hover:text-primary">Панель управления</Link>
        <Link href="/admin/users" className="block py-2 text-lg font-medium hover:text-primary">Пользователи</Link>
        <Link href="/admin/products" className="block py-2 text-lg font-medium hover:text-primary">Меню и товары</Link>
        <Link href="/admin/orders" className="block py-2 text-lg font-medium hover:text-primary">Заказы</Link>
        <Link href="/admin/courier-schedule" className="block py-2 text-lg font-medium hover:text-primary">График курьеров</Link>
        <Link href="/admin/reports" className="block py-2 text-lg font-medium hover:text-primary">Отчеты</Link>
      </nav>
      <div className="mt-6 border-t pt-4 space-y-2">
        <Link href="/" className="block py-2 text-base font-medium hover:text-primary">На витрину</Link>
        <Button
          variant="destructive"
          className="w-full justify-start"
          onClick={handleLogout}
          disabled={logout.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Выйти
        </Button>
      </div>
    </div>
  );
}

function RoleGuard({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth.data) {
    return <Redirect to="/auth" />;
  }

  if (!roles.includes(auth.data.role)) {
    if (auth.data.role === "admin") return <Redirect to="/admin" />;
    if (auth.data.role === "courier") return <Redirect to="/courier" />;
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AuthRoute() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth.data) {
    return <AuthPage />;
  }

  if (auth.data.role === "admin") return <Redirect to="/admin" />;
  if (auth.data.role === "courier") return <Redirect to="/courier" />;
  return <Redirect to="/" />;
}

function HomeRoute() {
  // Главная (/) — это витрина, доступная всем ролям.
  // Переходы из профиля/кабинетов должны вести сюда без редиректа обратно.
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10">
      <Storefront />
    </div>
  );
}


function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthRoute} />

      <Route path="/courier">
        <RoleGuard roles={["courier"]}>
          <CourierPage />
        </RoleGuard>
      </Route>

      <Route path="/profile">
        <RoleGuard roles={["customer"]}>
          <CustomerAccount />
        </RoleGuard>
      </Route>

      <Route path="/admin">
        <RoleGuard roles={["admin"]}>
          <AdminLayout><Dashboard /></AdminLayout>
        </RoleGuard>
      </Route>

      <Route path="/admin/users">
        <RoleGuard roles={["admin"]}>
          <AdminLayout><Users /></AdminLayout>
        </RoleGuard>
      </Route>

      <Route path="/admin/products">
        <RoleGuard roles={["admin"]}>
          <AdminLayout><Products /></AdminLayout>
        </RoleGuard>
      </Route>

      <Route path="/admin/orders">
        <RoleGuard roles={["admin"]}>
          <AdminLayout><Orders /></AdminLayout>
        </RoleGuard>
      </Route>

      <Route path="/admin/reports">
        <RoleGuard roles={["admin"]}>
          <AdminLayout><Reports /></AdminLayout>
        </RoleGuard>
      </Route>

      <Route path="/admin/courier-schedule">
        <RoleGuard roles={["admin"]}>
          <AdminLayout><CourierScheduleChartPage /></AdminLayout>
        </RoleGuard>
      </Route>

      <Route path="/" component={HomeRoute} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

