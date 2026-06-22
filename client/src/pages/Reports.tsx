import { useAnalytics, useAnalyticsExport } from "@/hooks/use-analytics";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, PackageCheck, ReceiptText, TrendingUp, Users } from "lucide-react";

function formatRub(value: number) {
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
}

export default function Reports() {
  const analytics = useAnalytics();
  const { exportData } = useAnalyticsExport();
  const summary = analytics.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold sm:text-3xl">Отчеты и аналитика</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Сводка по продажам, заказам, товарам и клиентам. Excel-файл формируется как полноценный отчет с отдельными листами и табличными диаграммами.
          </p>
        </div>
        <Button className="h-11 rounded-xl shadow-lg shadow-primary/20" onClick={() => exportData?.()}>
          <FileDown className="mr-2 h-4 w-4" />
          Скачать Excel
        </Button>
      </div>

      {analytics.isLoading ? (
        <div className="flex justify-center rounded-2xl border bg-white p-12">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetric icon={TrendingUp} label="Выручка" value={formatRub(summary?.totalRevenue || 0)} tone="text-emerald-700 bg-emerald-50" />
          <ReportMetric icon={ReceiptText} label="Заказы" value={String(summary?.totalOrders || 0)} tone="text-blue-700 bg-blue-50" />
          <ReportMetric icon={PackageCheck} label="Завершены" value={String(summary?.completedOrders || 0)} tone="text-teal-700 bg-teal-50" />
          <ReportMetric icon={Users} label="Клиенты" value={String(summary?.totalCustomers || 0)} tone="text-violet-700 bg-violet-50" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">Что попадет в Excel</h2>
              <p className="text-sm text-muted-foreground">Отчет готов для просмотра, печати и передачи руководителю.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Обзор с ключевыми KPI",
              "Динамика выручки по дням",
              "Топ товаров и категории меню",
              "Статусы и последние заказы",
              "Графики-диаграммы внутри листов",
              "Аккуратное оформление листов",
            ].map((item) => (
              <div key={item} className="rounded-xl border bg-muted/30 px-4 py-3 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-gradient-to-br from-teal-50 via-white to-orange-50 p-5 shadow-sm">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-primary shadow-sm">
            <FileDown className="w-8 h-8" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold">Аналитический отчет</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            В файле только данные магазина, доставки, заказов и ассортимента.
          </p>
          <Button className="mt-6 w-full rounded-xl h-11" onClick={() => exportData?.()}>
            <FileDown className="mr-2 w-4 h-4" />
            Скачать отчет
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReportMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-display font-bold">{value}</div>
    </div>
  );
}
