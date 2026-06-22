import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useCourierStats } from "@/hooks/use-courier";
import { usePublicManagerContact } from "@/hooks/use-manager-contact";
import { BarChart3, Clock, LogOut, Star, Truck, User, Phone, Headphones, Newspaper } from "lucide-react";

export function CourierAccount() {
  const { toast } = useToast();
  const auth = useAuth();
  const logout = useLogout();
  const contact = usePublicManagerContact();

  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const stats = useCourierStats(period);

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.href = "/auth";
  };

  return (
    <div className="space-y-4 pb-6">
      <Card className="rounded-2xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4 text-primary" /> Профиль курьера</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="font-semibold">{auth.data?.fullName || "Курьер"}</p>
            <p className="text-sm text-muted-foreground">{auth.data?.phone || "Телефон не указан"}</p>
          </div>
          <Badge variant="secondary">Роль: курьер</Badge>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="w-4 h-4 text-primary" /> Статистика</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Button variant={period === "day" ? "default" : "outline"} className="h-9" onClick={() => setPeriod("day")}>Сутки</Button>
            <Button variant={period === "week" ? "default" : "outline"} className="h-9" onClick={() => setPeriod("week")}>Неделя</Button>
            <Button variant={period === "month" ? "default" : "outline"} className="h-9" onClick={() => setPeriod("month")}>Месяц</Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <StatItem icon={Truck} label="Завершено" value={String(stats.data?.completedDeliveries ?? 0)} />
            <StatItem icon={Clock} label="Среднее время" value={`${Math.round(stats.data?.averageDeliveryMinutes ?? 0)} мин`} />
            <StatItem icon={Star} label="Успешность" value={`${Math.round(stats.data?.successRate ?? 0)}%`} />
            <StatItem icon={Truck} label="Активные" value={String(stats.data?.activeDeliveries ?? 0)} />
          </div>
        </CardContent>
      </Card>

      {/* Плашки навигации для курьера */}
      <div>
        <LinkCard
          href={contact.data?.telegramUrl || "https://max.ru/u/f9LHodD0cOKJyXx9spPr1Qc_3tGdWpdLED5xOB-SSjJw8Eo2vJyFCZjn0L4"}
          icon={Headphones}
          title="Связь"
          description="Перейти к менеджеру"
        />
      </div>

      <Button variant="destructive" className="w-full h-11 rounded-xl" onClick={handleLogout} disabled={logout.isPending}>
        <LogOut className="w-4 h-4 mr-2" /> Выйти
      </Button>
    </div>
  );
}

function LinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="block rounded-2xl border border-border/50 bg-card/50 shadow-sm hover:shadow-md transition-shadow p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center text-white">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </a>
  );
}

function StatItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3 bg-muted/30">
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</p>
      <p className="font-semibold text-lg">{value}</p>
    </div>
  );
}
