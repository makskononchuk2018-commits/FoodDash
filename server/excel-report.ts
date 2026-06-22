import * as xlsx from "xlsx";
import type { AnalyticsSummary } from "@shared/schema";

type Row = Array<string | number | null>;

const STATUS_LABELS: Record<string, string> = {
  new: "Новые",
  delivery: "В доставке",
  completed: "Завершены",
  cancelled: "Отменены",
  returning: "Возврат",
};

const STATUS_ORDER = ["new", "delivery", "completed", "cancelled", "returning"];
const MONEY_FORMAT = '#,##0 "₽"';
const PERCENT_FORMAT = "0.0%";

function safeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function percent(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function bar(value: number, maxValue: number, size = 18) {
  if (maxValue <= 0 || value <= 0) return "";
  const filled = Math.max(1, Math.round((value / maxValue) * size));
  return "█".repeat(filled) + "░".repeat(Math.max(size - filled, 0));
}

function dateText(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU");
}

function addSheet(workbook: xlsx.WorkBook, name: string, rows: Row[], options: {
  widths?: number[];
  merges?: xlsx.Range[];
  autoFilter?: string;
  moneyCols?: string[];
  percentCols?: string[];
  integerCols?: string[];
  formats?: Array<{ range: string; format: string }>;
} = {}) {
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = options.widths?.map((wch) => ({ wch }));
  sheet["!merges"] = options.merges;
  if (options.autoFilter) sheet["!autofilter"] = { ref: options.autoFilter };

  const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:A1");
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const ref = xlsx.utils.encode_cell({ r: row, c: col });
      const cell = sheet[ref];
      if (!cell) continue;

      const column = xlsx.utils.encode_col(col);
      if (options.moneyCols?.includes(column) && typeof cell.v === "number") {
        cell.z = MONEY_FORMAT;
      }
      if (options.percentCols?.includes(column) && typeof cell.v === "number") {
        cell.z = PERCENT_FORMAT;
      }
      if (options.integerCols?.includes(column) && typeof cell.v === "number") {
        cell.z = "0";
      }
    }
  }

  for (const item of options.formats || []) {
    const decoded = xlsx.utils.decode_range(item.range);
    for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
      for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
        const ref = xlsx.utils.encode_cell({ r: row, c: col });
        const cell = sheet[ref];
        if (cell && typeof cell.v === "number") {
          cell.z = item.format;
        }
      }
    }
  }

  xlsx.utils.book_append_sheet(workbook, sheet, name);
}

function buildOverview(summary: AnalyticsSummary) {
  const sales = summary.salesByDate.length ? summary.salesByDate : [{ date: "Нет данных", amount: 0, orders: 0 }];
  const topProducts = summary.topProducts.length ? summary.topProducts : [{ name: "Нет данных", quantity: 0, revenue: 0 }];
  const maxSales = Math.max(...sales.map((item) => safeNumber(item.amount)), 0);
  const maxProductRevenue = Math.max(...topProducts.map((item) => safeNumber(item.revenue)), 0);
  const maxStatus = Math.max(...STATUS_ORDER.map((status) => safeNumber(summary.ordersByStatus?.[status])), 0);
  const completionRate = percent(summary.completedOrders || 0, summary.totalOrders || 0);

  const rows: Row[] = [
    ["FoodDash: аналитический отчет"],
    [`Сформировано: ${new Date().toLocaleString("ru-RU")}`],
    [],
    ["Ключевые показатели", "Значение", "Пояснение", "", "Операционные показатели", "Значение", "Пояснение"],
    ["Выручка", summary.totalRevenue, "Только завершенные заказы", "", "Клиентов", summary.totalCustomers || 0, "Активные клиентские аккаунты"],
    ["Всего заказов", summary.totalOrders, "Все статусы", "", "Товаров в меню", summary.totalProducts || 0, "Активный ассортимент"],
    ["Средний чек", summary.averageOrderValue, "По завершенным заказам", "", "Мало остатков", summary.lowStockProducts || 0, "Остаток 10 или меньше"],
    ["Завершение", completionRate, "Доля завершенных заказов", "", "Продано позиций", summary.totalItemsSold || 0, "Количество блюд в заказах"],
    [],
    ["Динамика выручки", "Выручка", "Заказы", "Диаграмма"],
    ...sales.slice(-14).map((item) => [
      item.date,
      safeNumber(item.amount),
      safeNumber(item.orders),
      bar(safeNumber(item.amount), maxSales),
    ]),
    [],
    ["Статусы заказов", "Количество", "Доля", "Диаграмма"],
    ...STATUS_ORDER.map((status) => {
      const count = safeNumber(summary.ordersByStatus?.[status]);
      return [STATUS_LABELS[status], count, percent(count, summary.totalOrders || 0), bar(count, maxStatus)];
    }),
    [],
    ["Топ товаров", "Продано", "Выручка", "Доля выручки", "Диаграмма"],
    ...topProducts.slice(0, 10).map((item) => {
      const revenue = safeNumber(item.revenue);
      return [
        item.name,
        safeNumber(item.quantity),
        revenue,
        percent(revenue, summary.totalRevenue || 0),
        bar(revenue, maxProductRevenue),
      ];
    }),
  ];

  return rows;
}

function buildSalesSheet(summary: AnalyticsSummary) {
  const sales = summary.salesByDate.length ? summary.salesByDate : [{ date: "Нет данных", amount: 0, orders: 0 }];
  const maxSales = Math.max(...sales.map((item) => safeNumber(item.amount)), 0);

  return [
    ["Динамика продаж"],
    ["Дата", "Выручка", "Заказы", "Средний чек", "Диаграмма"],
    ...sales.map((item) => {
      const amount = safeNumber(item.amount);
      const orders = safeNumber(item.orders);
      return [item.date, amount, orders, orders > 0 ? amount / orders : 0, bar(amount, maxSales, 24)];
    }),
  ];
}

function buildProductsSheet(summary: AnalyticsSummary) {
  const topProducts = summary.topProducts.length ? summary.topProducts : [{ name: "Нет данных", quantity: 0, revenue: 0 }];
  const categories = summary.productCategories?.length
    ? summary.productCategories
    : [{ category: "Нет данных", products: 0, stock: 0, stockValue: 0 }];
  const maxRevenue = Math.max(...topProducts.map((item) => safeNumber(item.revenue)), 0);
  const maxStockValue = Math.max(...categories.map((item) => safeNumber(item.stockValue)), 0);

  return [
    ["Товары и ассортимент"],
    ["Топ товаров"],
    ["Товар", "Продано, шт.", "Выручка", "Доля выручки", "Диаграмма"],
    ...topProducts.slice(0, 15).map((item) => {
      const revenue = safeNumber(item.revenue);
      return [
        item.name,
        safeNumber(item.quantity),
        revenue,
        percent(revenue, summary.totalRevenue || 0),
        bar(revenue, maxRevenue, 24),
      ];
    }),
    [],
    ["Категории меню"],
    ["Категория", "Товаров", "Остаток", "Стоимость остатков", "Диаграмма"],
    ...categories.map((item) => [
      item.category,
      safeNumber(item.products),
      safeNumber(item.stock),
      safeNumber(item.stockValue),
      bar(safeNumber(item.stockValue), maxStockValue, 24),
    ]),
  ];
}

function buildOrdersSheet(summary: AnalyticsSummary) {
  const maxStatus = Math.max(...STATUS_ORDER.map((status) => safeNumber(summary.ordersByStatus?.[status])), 0);
  const recentOrders = summary.recentOrders?.length
    ? summary.recentOrders
    : [{
        id: 0,
        createdAt: "",
        customerName: "Нет данных",
        status: "new" as const,
        courierName: null,
        totalAmount: 0,
      }];

  return [
    ["Заказы"],
    ["Статус", "Количество", "Доля", "Диаграмма"],
    ...STATUS_ORDER.map((status) => {
      const count = safeNumber(summary.ordersByStatus?.[status]);
      return [STATUS_LABELS[status], count, percent(count, summary.totalOrders || 0), bar(count, maxStatus, 24)];
    }),
    [],
    ["Последние заказы"],
    ["ID", "Дата", "Клиент", "Статус", "Курьер", "Сумма"],
    ...recentOrders.map((order) => [
      order.id ? `#${order.id}` : "",
      dateText(order.createdAt),
      order.customerName,
      STATUS_LABELS[order.status] || order.status,
      order.courierName || "Не назначен",
      safeNumber(order.totalAmount),
    ]),
  ];
}

function buildRecommendationsSheet(summary: AnalyticsSummary) {
  const completionRate = percent(summary.completedOrders || 0, summary.totalOrders || 0);
  const cancellationRate = percent(summary.cancelledOrders || 0, summary.totalOrders || 0);
  const lowStock = summary.lowStockProducts || 0;

  const recommendations: Row[] = [
    ["Операционные выводы"],
    ["Метрика", "Текущее значение", "Что проверить"],
    ["Доля завершенных заказов", completionRate, completionRate < 0.75 ? "Разберите причины отмен и задержек" : "Показатель выглядит стабильно"],
    ["Доля отмен", cancellationRate, cancellationRate > 0.15 ? "Проверьте проблемные причины отмен" : "Отмены в нормальном диапазоне"],
    ["Мало остатков", lowStock, lowStock > 0 ? "Пополните позиции с остатком 10 или меньше" : "Критичных остатков нет"],
    ["Средний чек", summary.averageOrderValue, "Сравните с целевым средним чеком"],
    ["Активные заказы", summary.activeOrders || 0, "Проверьте новые заказы и загрузку курьеров"],
  ];

  return recommendations;
}

export function buildAnalyticsWorkbookBuffer(summary: AnalyticsSummary, _type: "monthly" | "full" = "full") {
  const workbook = xlsx.utils.book_new();
  const salesCount = Math.max(summary.salesByDate.length, 1);
  const topProductCount = Math.max(summary.topProducts.length, 1);
  const categoryCount = Math.max(summary.productCategories?.length || 0, 1);
  const recentOrderCount = Math.max(summary.recentOrders?.length || 0, 1);
  const overviewSalesStart = 11;
  const overviewSalesEnd = overviewSalesStart + salesCount - 1;
  const overviewStatusStart = overviewSalesEnd + 3;
  const overviewStatusEnd = overviewStatusStart + STATUS_ORDER.length - 1;
  const overviewProductsStart = overviewStatusEnd + 3;
  const overviewProductsEnd = overviewProductsStart + topProductCount - 1;
  const productCategoryHeader = 6 + topProductCount;
  const productCategoryStart = productCategoryHeader + 1;
  const productCategoryEnd = productCategoryStart + categoryCount - 1;
  const recentOrdersHeader = 5 + STATUS_ORDER.length;
  const recentOrdersStart = recentOrdersHeader + 1;
  const recentOrdersEnd = recentOrdersStart + recentOrderCount - 1;

  workbook.Props = {
    Title: "FoodDash аналитический отчет",
    Subject: "Продажи, заказы, товары и доставка",
    Author: "FoodDash",
    Company: "FoodDash",
    CreatedDate: new Date(),
  };

  addSheet(workbook, "Обзор", buildOverview(summary), {
    widths: [24, 16, 28, 28, 24, 16, 32],
    merges: [xlsx.utils.decode_range("A1:G1")],
    formats: [
      { range: "B5:B5", format: MONEY_FORMAT },
      { range: "B6:B6", format: "0" },
      { range: "B7:B7", format: MONEY_FORMAT },
      { range: "B8:B8", format: PERCENT_FORMAT },
      { range: "F5:F8", format: "0" },
      { range: `B${overviewSalesStart}:B${overviewSalesEnd}`, format: MONEY_FORMAT },
      { range: `C${overviewSalesStart}:C${overviewSalesEnd}`, format: "0" },
      { range: `B${overviewStatusStart}:B${overviewStatusEnd}`, format: "0" },
      { range: `C${overviewStatusStart}:C${overviewStatusEnd}`, format: PERCENT_FORMAT },
      { range: `B${overviewProductsStart}:B${overviewProductsEnd}`, format: "0" },
      { range: `C${overviewProductsStart}:C${overviewProductsEnd}`, format: MONEY_FORMAT },
      { range: `D${overviewProductsStart}:D${overviewProductsEnd}`, format: PERCENT_FORMAT },
    ],
  });

  addSheet(workbook, "Динамика продаж", buildSalesSheet(summary), {
    widths: [16, 16, 12, 16, 32],
    merges: [xlsx.utils.decode_range("A1:E1")],
    autoFilter: `A2:E${salesCount + 2}`,
    moneyCols: ["B", "D"],
    integerCols: ["C"],
  });

  addSheet(workbook, "Товары", buildProductsSheet(summary), {
    widths: [34, 14, 16, 16, 32],
    merges: [xlsx.utils.decode_range("A1:E1")],
    formats: [
      { range: `B3:B${topProductCount + 2}`, format: "0" },
      { range: `C3:C${topProductCount + 2}`, format: MONEY_FORMAT },
      { range: `D3:D${topProductCount + 2}`, format: PERCENT_FORMAT },
      { range: `B${productCategoryStart}:C${productCategoryEnd}`, format: "0" },
      { range: `D${productCategoryStart}:D${productCategoryEnd}`, format: MONEY_FORMAT },
    ],
  });

  addSheet(workbook, "Заказы", buildOrdersSheet(summary), {
    widths: [16, 16, 28, 18, 24, 16],
    merges: [xlsx.utils.decode_range("A1:F1")],
    formats: [
      { range: `B3:B${STATUS_ORDER.length + 2}`, format: "0" },
      { range: `C3:C${STATUS_ORDER.length + 2}`, format: PERCENT_FORMAT },
      { range: `F${recentOrdersStart}:F${recentOrdersEnd}`, format: MONEY_FORMAT },
    ],
  });

  addSheet(workbook, "Выводы", buildRecommendationsSheet(summary), {
    widths: [28, 18, 48],
    merges: [xlsx.utils.decode_range("A1:C1")],
    formats: [
      { range: "B3:B4", format: PERCENT_FORMAT },
      { range: "B6:B6", format: MONEY_FORMAT },
    ],
  });

  return xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
    cellStyles: false,
  });
}
