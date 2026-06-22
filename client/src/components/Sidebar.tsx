import { Link, useLocation } from "wouter";
import { LayoutDashboard, UtensilsCrossed, ShoppingBag, PieChart, LogOut, Truck, Home, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/use-auth";

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const logout = useLogout();

  const links = [
    { href: "/admin", label: "Панель управления", icon: LayoutDashboard },
    { href: "/admin/users", label: "Пользователи", icon: Users },
    { href: "/admin/products", label: "Меню и товары", icon: UtensilsCrossed },
    { href: "/admin/orders", label: "Заказы", icon: ShoppingBag },
    { href: "/admin/courier-schedule", label: "График курьеров", icon: Clock },
    { href: "/admin/reports", label: "Отчеты", icon: PieChart },
  ];

  const handleLogout = async () => {
    await logout.mutateAsync();
    toast({ title: "Выход выполнен", description: "До встречи" });
    setLocation("/auth");
  };

  return (
    <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl h-screen sticky top-0 flex flex-col hidden md:flex">
      <div className="p-6 flex-1">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl leading-none tracking-tight">FoodDash</h1>
            <p className="text-xs text-muted-foreground mt-1">Панель управления</p>
          </div>
        </div>

        <nav className="space-y-1.5">
          {links.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href} className={cn("nav-item group", isActive ? "nav-item-active" : "nav-item-inactive")}>
                <link.icon className={cn("w-5 h-5 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-6 border-t border-border/50 space-y-2">
        <Link href="/" className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium hover:bg-muted transition-colors">
          <Home className="w-5 h-5 text-muted-foreground" />
          На витрину
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Выйти
        </button>
      </div>
    </aside>
  );
}
