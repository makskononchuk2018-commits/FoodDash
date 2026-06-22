import { z } from "zod";
import {
  insertProductSchema,
  products,
  orders,
  USER_ROLES,
  ORDER_STATUSES,
  CreateOrderRequest,
} from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  forbidden: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

const orderCreateInput = z.object({
  customerName: z.string().min(2),
  customerPhone: z.string().min(5),
  customerAddress: z.string().min(5),
  channel: z.enum(["website", "wildberries", "ozon", "yandex"]).optional(),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() })).min(1),
  useBonuses: z.boolean().optional(),
});

const productImportResponse = z.object({
  totalRows: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  markupPercent: z.number().nonnegative(),
  errors: z.array(z.object({
    row: z.number().int().positive(),
    message: z.string(),
  })),
});

export const api = {
  auth: {
    me: {
      method: "GET" as const,
      path: "/api/auth/me",
      responses: {
        200: z.object({
          user: z.object({
            id: z.number(),
            username: z.string(),
            role: z.enum(USER_ROLES),
            fullName: z.string(),
            email: z.string().nullable(),
            phone: z.string().nullable(),
          }),
        }),
        401: errorSchemas.unauthorized,
      },
    },
  },
  products: {
    list: {
      method: "GET" as const,
      path: "/api/products",
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/products/:id",
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/products",
      input: insertProductSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    importTemplate: {
      method: "GET" as const,
      path: "/api/products/import-template",
      responses: {
        200: z.any(),
      },
    },
    importCatalog: {
      method: "POST" as const,
      path: "/api/products/import",
      responses: {
        200: productImportResponse,
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/products/:id",
      input: insertProductSchema.partial(),
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/products/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  orders: {
    list: {
      method: "GET" as const,
      path: "/api/orders",
      responses: {
        200: z.array(z.any()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/orders",
      input: orderCreateInput,
      responses: {
        201: z.any(),
        400: errorSchemas.validation,
      },
    },
    updateStatus: {
      method: "PATCH" as const,
      path: "/api/orders/:id/status",
      input: z.object({ status: z.enum(ORDER_STATUSES) }),
      responses: {
        200: z.custom<typeof orders.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  analytics: {
    summary: {
      method: "GET" as const,
      path: "/api/analytics/summary",
      responses: {
        200: z.custom<{
          totalRevenue: number;
          totalOrders: number;
          completedOrders: number;
          activeOrders: number;
          cancelledOrders: number;
          returningOrders: number;
          averageOrderValue: number;
          ordersByChannel: Record<string, number>;
          ordersByStatus: Record<string, number>;
          totalCustomers: number;
          totalProducts: number;
          lowStockProducts: number;
          totalItemsSold: number;
          topProducts: any[];
          salesByDate: any[];
          productCategories: any[];
          recentOrders: any[];
        }>(),
      },
    },
    export: {
      method: "GET" as const,
      path: "/api/analytics/export",
      responses: {
        200: z.any(),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export const customerOrderSchema = orderCreateInput satisfies z.ZodType<CreateOrderRequest>;
