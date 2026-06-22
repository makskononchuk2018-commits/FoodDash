import type { Express, Request, Response } from "express";
import type { Server } from "http";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { api, customerOrderSchema } from "@shared/routes";
import { ORDER_STATUSES, USER_ROLES, type AuthUser, type OrderStatus } from "@shared/schema";
import { storage } from "./storage";
import { hashPassword, requireAuth, requireRole, verifyPassword } from "./auth";
import { sendConflict, sendNotFound, sendValidationError } from "./api-utils";
import { db } from "./db";
import * as schema from "@shared/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { registerCourierDeliveryRoutes } from "./routes-courier-delivery";
import { registerCancellationRoutes } from "./routes-cancellation";
import { registerAdminOrderRoutes } from "./routes-admin-orders";
import { buildAnalyticsWorkbookBuffer } from "./excel-report";
import {
  buildProductImportTemplateBuffer,
  normalizeProductName,
  parseProductImportWorkbook,
  type ProductImportError,
} from "./product-import";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const registerCustomerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional().nullable(),
});

const courierApplicationSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional().nullable(),
  experience: z.string().max(1000).optional().nullable(),
  comment: z.string().max(1000).optional().nullable(),
});

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(USER_ROLES),
  fullName: z.string().min(2),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(5).optional().nullable(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(USER_ROLES).optional(),
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(5).optional().nullable(),
});

const approveCourierApplicationSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  adminComment: z.string().max(1000).optional().nullable(),
});

const rejectCourierApplicationSchema = z.object({
  adminComment: z.string().max(1000).optional().nullable(),
});

const managerContactSchema = z.object({
  label: z.string().min(2).default("Связь с менеджером"),
  telegramUrl: z.string().url(),
  telegramUsername: z.string().min(2).optional().nullable(),
});

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

const courierStatsQuerySchema = z.object({
  period: z.enum(["day", "week", "month"]).default("week"),
});

const exportQuerySchema = z.object({
  type: z.enum(["monthly", "full"]).default("full"),
});

const streamSubscribers = new Map<number, Set<Response>>();

function toAuthUser(user: {
  id: number;
  username: string;
  role: "customer" | "admin" | "courier";
  fullName: string;
  email: string | null;
  phone: string | null;
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
  };
}

function subscribeOrderEvents(orderId: number, res: Response) {
  const current = streamSubscribers.get(orderId) || new Set<Response>();
  current.add(res);
  streamSubscribers.set(orderId, current);
}

function unsubscribeOrderEvents(orderId: number, res: Response) {
  const current = streamSubscribers.get(orderId);

  if (!current) {
    return;
  }

  current.delete(res);

  if (current.size === 0) {
    streamSubscribers.delete(orderId);
  }
}

function broadcastOrderEvent(orderId: number, payload: unknown) {
  const current = streamSubscribers.get(orderId);

  if (!current || current.size === 0) {
    return;
  }

  const data = `event: order_event\ndata: ${JSON.stringify(payload)}\n\n`;

  current.forEach((res) => {
    res.write(data);
  });
}

function setSseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

function sanitizeAdminUser(user: any) {
  const { password: _password, ...rest } = user;
  return rest;
}

function normalizeStatus(input?: string): "active" | "deleted" | "all" {
  if (input === "active" || input === "deleted" || input === "all") {
    return input;
  }

  return "all";
}

function toCourierLocationPayload(location: typeof schema.courierLocations.$inferSelect) {
  return {
    id: location.id,
    courierId: location.courierId,
    orderId: location.orderId,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    accuracy: location.accuracy === null ? null : Number(location.accuracy),
    speed: location.speed === null ? null : Number(location.speed),
    heading: location.heading === null ? null : Number(location.heading),
    timestamp: location.timestamp,
  };
}

async function seedData() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  await db.execute(sql`UPDATE orders SET status = 'new', updated_at = NOW() WHERE status = 'kitchen'`);

  const adminUsername = "admin";
  const courierUsername = "courier";
  const customerUsername = "customer";

  let admin = await storage.getUserByUsername(adminUsername);
  if (!admin) {
    admin = await storage.createUser({
      username: adminUsername,
      password: await hashPassword("admin123"),
      role: "admin",
      fullName: "Главный администратор",
      email: "admin@fooddash.local",
      phone: "+7 (999) 100-00-00",
    });
  } else if (admin.role !== "admin") {
    const updated = await storage.updateUser(admin.id, { role: "admin" });
    if (updated) admin = updated;
  }

  let courier = await storage.getUserByUsername(courierUsername);
  if (!courier) {
    courier = await storage.createUser({
      username: courierUsername,
      password: await hashPassword("courier123"),
      role: "courier",
      fullName: "Иван Курьер",
      email: "courier@fooddash.local",
      phone: "+7 (999) 200-00-00",
    });
  } else if (courier.role !== "courier") {
    const updated = await storage.updateUser(courier.id, { role: "courier" });
    if (updated) courier = updated;
  }

  let customer = await storage.getUserByUsername(customerUsername);
  if (!customer) {
    customer = await storage.createUser({
      username: customerUsername,
      password: await hashPassword("customer123"),
      role: "customer",
      fullName: "Мария Клиент",
      email: "customer@fooddash.local",
      phone: "+7 (999) 300-00-00",
    });
  } else if (customer.role !== "customer") {
    const updated = await storage.updateUser(customer.id, { role: "customer" });
    if (updated) customer = updated;
  }


  const contact = await storage.getActiveManagerContact();
  if (!contact) {
    await storage.upsertManagerContact({
      label: "Связь с менеджером",
      telegramUrl: "https://t.me/fooddash_manager",
      telegramUsername: "fooddash_manager",
      updatedBy: admin.id,
    });
  }

  const existingProducts = await storage.getProducts();
  if (existingProducts.length === 0) {
    await storage.createProduct({
      name: "Цезарь с курицей",
      description: "Классический салат с курицей и пармезаном",
      price: "450.00",
      stock: 30,
      category: "Салаты",
      imageUrl: "https://images.unsplash.com/photo-1546793665-c74683f339c1",
      marketplaceStatus: {},
    });

    await storage.createProduct({
      name: "Паста Карбонара",
      description: "Паста с беконом, сливочным соусом и сыром",
      price: "590.00",
      stock: 24,
      category: "Паста",
      imageUrl: "https://images.unsplash.com/photo-1612874742237-6526221588e3",
      marketplaceStatus: {},
    });

    await storage.createProduct({
      name: "Пицца Маргарита",
      description: "Томатный соус, моцарелла, базилик",
      price: "700.00",
      stock: 20,
      category: "Пицца",
      imageUrl: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3",
      marketplaceStatus: {},
    });
  }

  const existingOrders = await storage.getOrders();
  if (existingOrders.length === 0) {
    const products = await storage.getProducts();
    const first = products[0];
    const second = products[1] || products[0];

    if (first && second) {
      const created = await storage.createOrder(customer.id, {
        customerName: customer.fullName,
        customerPhone: customer.phone || "+7 (999) 300-00-00",
        customerAddress: "Екатеринбург, ул. Ленина, 10",
        channel: "website",
        items: [
          { productId: first.id, quantity: 1 },
          { productId: second.id, quantity: 1 },
        ],
      });

      await storage.acceptCourierOrder(created.order.id, courier.id);
      await storage.updateOrderStatus(created.order.id, "completed", { id: courier.id, role: "courier" });
    }
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Auth
  app.post("/api/auth/register", async (req, res) => {
    try {
      const input = registerCustomerSchema.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);

      if (existing) {
        return sendConflict(res, "Пользователь с таким логином уже существует");
      }

      const password = await hashPassword(input.password);
      const created = await storage.createUser({
        username: input.username,
        password,
        role: "customer",
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone,
      });

      req.session.user = {
        id: created.id,
        username: created.username,
        role: created.role,
      };

      return res.status(201).json({ user: toAuthUser(created) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные регистрации");
      }

      throw error;
    }
  });

  app.post("/api/auth/courier-application", async (req, res) => {
    try {
      const input = courierApplicationSchema.parse(req.body);

      const [created] = await db
        .insert(schema.courierApplications)
        .values({
          fullName: input.fullName,
          phone: input.phone,
          email: input.email ?? null,
          experience: input.experience ?? null,
          comment: input.comment ?? null,
        })
        .returning();

      return res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные заявки");
      }

      throw error;
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(input.username);

      if (!user || user.isDeleted) {
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }

      const isValid = await verifyPassword(input.password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };

      return res.json({ user: toAuthUser(user) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные авторизации");
      }

      throw error;
    }
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("fd_session");
      res.clearCookie("fd_auth");
      res.clearCookie("fd_role");
      res.status(204).send();
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.sessionUser) {
      return res.status(401).json({ message: "Требуется авторизация" });
    }

    const user = await storage.getUser(req.sessionUser.id);

    if (!user || user.isDeleted) {
      req.session.destroy(() => {
        res.clearCookie("fd_session");
        res.clearCookie("fd_auth");
        res.clearCookie("fd_role");
        res.status(401).json({ message: "Сессия недействительна" });
      });
      return;
    }

    return res.json({ user: toAuthUser(user) });
  });

  // Admin users
  app.get("/api/admin/users", requireRole("admin"), async (req, res) => {
    const role = req.query.role;
    const parsedRole = typeof role === "string" && USER_ROLES.includes(role as any) ? (role as any) : undefined;
    const status = normalizeStatus(typeof req.query.status === "string" ? req.query.status : undefined);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const data = await storage.listUsers({ role: parsedRole, status, search });
    res.json(data);
  });

  app.post("/api/admin/users", requireRole("admin"), async (req, res) => {
    try {
      const input = createUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);

      if (existing) {
        return sendConflict(res, "Пользователь с таким логином уже существует");
      }

      const password = await hashPassword(input.password);
      const created = await storage.createUser({ ...input, password });

      res.status(201).json(sanitizeAdminUser(created));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные пользователя");
      }

      throw error;
    }
  });

  app.patch("/api/admin/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (Number.isNaN(id)) {
        return sendValidationError(res, "Некорректный идентификатор пользователя", "id");
      }

      const input = updateUserSchema.parse(req.body);
      const payload = { ...input } as any;

      if (input.password) {
        payload.password = await hashPassword(input.password);
      }

      const updated = await storage.updateUser(id, payload);

      if (!updated) {
        return sendNotFound(res, "Пользователь не найден");
      }

      res.json(sanitizeAdminUser(updated));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные для обновления");
      }

      throw error;
    }
  });

  app.delete("/api/admin/users/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return sendValidationError(res, "Некорректный идентификатор пользователя", "id");
    }

    if (req.sessionUser && req.sessionUser.id === id) {
      return sendValidationError(res, "Нельзя удалить текущего пользователя");
    }

    const deleted = await storage.softDeleteUser(id);

    if (!deleted) {
      return sendNotFound(res, "Пользователь не найден");
    }

    return res.status(204).send();
  });

  app.post("/api/admin/users/:id/restore", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return sendValidationError(res, "Некорректный идентификатор пользователя", "id");
    }

    const restored = await storage.restoreUser(id);

    if (!restored) {
      return sendNotFound(res, "Пользователь не найден");
    }

    res.json(sanitizeAdminUser(restored));
  });

  app.get("/api/admin/courier-applications", requireRole("admin"), async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const statusFilter = schema.COURIER_APPLICATION_STATUSES.includes(status as any)
      ? (status as schema.CourierApplicationStatus)
      : undefined;

    const applications = await db
      .select({
        id: schema.courierApplications.id,
        fullName: schema.courierApplications.fullName,
        phone: schema.courierApplications.phone,
        email: schema.courierApplications.email,
        experience: schema.courierApplications.experience,
        comment: schema.courierApplications.comment,
        status: schema.courierApplications.status,
        adminComment: schema.courierApplications.adminComment,
        reviewedById: schema.courierApplications.reviewedById,
        reviewedAt: schema.courierApplications.reviewedAt,
        createdAt: schema.courierApplications.createdAt,
        updatedAt: schema.courierApplications.updatedAt,
        reviewer: {
          id: schema.users.id,
          fullName: schema.users.fullName,
          username: schema.users.username,
        },
      })
      .from(schema.courierApplications)
      .leftJoin(schema.users, eq(schema.courierApplications.reviewedById, schema.users.id))
      .where(statusFilter ? eq(schema.courierApplications.status, statusFilter) : undefined)
      .orderBy(desc(schema.courierApplications.createdAt));

    res.json(applications);
  });

  app.post("/api/admin/courier-applications/:id/approve", requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (Number.isNaN(id)) {
        return sendValidationError(res, "Некорректный идентификатор заявки", "id");
      }

      const input = approveCourierApplicationSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(input.username);

      if (existingUser) {
        return sendConflict(res, "Пользователь с таким логином уже существует");
      }

      const [application] = await db
        .select()
        .from(schema.courierApplications)
        .where(eq(schema.courierApplications.id, id))
        .limit(1);

      if (!application) {
        return sendNotFound(res, "Заявка не найдена");
      }

      if (application.status !== "pending") {
        return sendConflict(res, "Эта заявка уже обработана");
      }

      const password = await hashPassword(input.password);

      const result = await db.transaction(async (tx) => {
        const [createdUser] = await tx
          .insert(schema.users)
          .values({
            username: input.username,
            password,
            role: "courier",
            fullName: application.fullName,
            email: application.email,
            phone: application.phone,
          })
          .returning();

        const [updatedApplication] = await tx
          .update(schema.courierApplications)
          .set({
            status: "approved",
            adminComment: input.adminComment ?? null,
            reviewedById: req.sessionUser!.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.courierApplications.id, id))
          .returning();

        return {
          application: updatedApplication,
          user: sanitizeAdminUser(createdUser),
        };
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные одобрения заявки");
      }

      throw error;
    }
  });

  app.post("/api/admin/courier-applications/:id/reject", requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (Number.isNaN(id)) {
        return sendValidationError(res, "Некорректный идентификатор заявки", "id");
      }

      const input = rejectCourierApplicationSchema.parse(req.body);

      const [application] = await db
        .select()
        .from(schema.courierApplications)
        .where(eq(schema.courierApplications.id, id))
        .limit(1);

      if (!application) {
        return sendNotFound(res, "Заявка не найдена");
      }

      if (application.status !== "pending") {
        return sendConflict(res, "Эта заявка уже обработана");
      }

      const [updated] = await db
        .update(schema.courierApplications)
        .set({
          status: "rejected",
          adminComment: input.adminComment ?? null,
          reviewedById: req.sessionUser!.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.courierApplications.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные отклонения заявки");
      }

      throw error;
    }
  });

  // Manager contact
  app.get("/api/admin/manager-contact", requireRole("admin"), async (_req, res) => {
    const contact = await storage.getActiveManagerContact();
    res.json(contact || null);
  });

  app.put("/api/admin/manager-contact", requireRole("admin"), async (req, res) => {
    try {
      const input = managerContactSchema.parse(req.body);
      const contact = await storage.upsertManagerContact({
        ...input,
        updatedBy: req.sessionUser?.id,
      });

      res.json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные контакта");
      }

      throw error;
    }
  });

  app.get("/api/public/manager-contact", async (_req, res) => {
    const contact = await storage.getActiveManagerContact();

    if (!contact) {
      return sendNotFound(res, "Контакт менеджера не настроен");
    }

    res.json(contact);
  });

  // Courier Schedule
  app.get("/api/admin/courier-schedule", requireRole("admin"), async (_req, res) => {
    try {
      const couriers = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.role, "courier"), eq(schema.users.isDeleted, false)))
        .orderBy(asc(schema.users.fullName));

      const scheduleData = await Promise.all(
        couriers.map(async (courier) => {
          const schedules = await db
            .select()
            .from(schema.courierSchedule)
            .where(eq(schema.courierSchedule.courierId, courier.id))
            .orderBy(asc(schema.courierSchedule.dayOfWeek));

          return {
            id: courier.id,
            fullName: courier.fullName,
            email: courier.email,
            phone: courier.phone,
            schedules: schedules.map((s) => ({
              id: s.id,
              dayOfWeek: s.dayOfWeek,
              timeSlots: s.timeSlots || [],
            })),
          };
        }),
      );

      res.json(scheduleData);
    } catch (error) {
      console.error("Error fetching courier schedules:", error);
      res.status(500).json({ message: "Не удалось загрузить графики курьеров" });
    }
  });

  // Products
  const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const ext = path.extname(file.originalname).toLocaleLowerCase();

      if ([".xlsx", ".xls"].includes(ext)) {
        callback(null, true);
        return;
      }

      callback(new Error("Загрузите файл Excel в формате .xlsx или .xls"));
    },
  });

  const parseExcelUpload = (req: Request, res: Response, next: (error?: unknown) => void) => {
    excelUpload.single("file")(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        sendValidationError(res, "Excel-файл слишком большой. Максимум 8 МБ", "file");
        return;
      }

      if (error instanceof Error) {
        sendValidationError(res, error.message, "file");
        return;
      }

      next(error);
    });
  };

  app.get(api.products.list.path, async (_req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get(api.products.importTemplate.path, requireRole("admin"), (_req, res) => {
    const buf = buildProductImportTemplateBuffer();
    res.setHeader("Content-Disposition", "attachment; filename=product-import-template.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  app.post(api.products.importCatalog.path, requireRole("admin"), parseExcelUpload, async (req, res) => {
    try {
      if (!req.file) {
        return sendValidationError(res, "Выберите Excel-файл для импорта", "file");
      }

      const parsed = parseProductImportWorkbook(req.file.buffer, req.body?.markupPercent);

      if (parsed.fatalError) {
        return sendValidationError(res, parsed.fatalError, "file");
      }

      if (parsed.totalRows === 0) {
        return sendValidationError(res, "В файле нет строк с товарами", "file");
      }

      const errors: ProductImportError[] = [...parsed.errors];
      const existingProducts = await storage.getProducts();
      const productsByName = new Map(existingProducts.map((product) => [normalizeProductName(product.name), product]));
      let created = 0;
      let updated = 0;

      for (const item of parsed.items) {
        const key = normalizeProductName(item.product.name);
        const existing = productsByName.get(key);

        try {
          if (existing) {
            const product = await storage.updateProduct(existing.id, {
              ...item.product,
              stock: existing.stock + item.quantity,
            });

            if (!product) {
              throw new Error("Товар не найден для обновления");
            }

            productsByName.set(key, product);
            updated += 1;
          } else {
            const product = await storage.createProduct(item.product);
            productsByName.set(key, product);
            created += 1;
          }
        } catch (error) {
          errors.push({
            row: item.rowNumber,
            message: error instanceof Error ? error.message : "Не удалось импортировать товар",
          });
        }
      }

      res.json({
        totalRows: parsed.totalRows,
        created,
        updated,
        skipped: errors.length,
        markupPercent: parsed.markupPercent,
        errors,
      });
    } catch (error) {
      if (error instanceof Error) {
        return sendValidationError(res, error.message, "file");
      }

      throw error;
    }
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) return sendNotFound(res, "Товар не найден");
    res.json(product);
  });

  app.post(api.products.create.path, requireRole("admin"), async (req, res) => {
    try {
      const input = api.products.create.input.parse(req.body);
      const product = await storage.createProduct(input);
      res.status(201).json(product);
    } catch (e) {
      if (e instanceof z.ZodError) return sendValidationError(res, "Некорректные данные товара");
      throw e;
    }
  });

  app.put(api.products.update.path, requireRole("admin"), async (req, res) => {
    try {
      const input = api.products.update.input.parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), input);

      if (!product) {
        return sendNotFound(res, "Товар не найден");
      }

      res.json(product);
    } catch (e) {
      if (e instanceof z.ZodError) return sendValidationError(res, "Некорректные данные товара");
      throw e;
    }
  });

  app.delete(api.products.delete.path, requireRole("admin"), async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.status(204).send();
  });

  // File uploads for product images
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Simple multipart form data parser for image uploads
  const parseMultipartImage = async (req: Request): Promise<{ buffer: Buffer; contentType: string } | null> => {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let boundary = "";
      let imageBuffer: Buffer | null = null;
      let contentType = "";

      const contentTypeHeader = req.get("content-type") || "";
      
      // Extract boundary from Content-Type header
      const boundaryMatch = contentTypeHeader.match(/boundary=([^;]+)/);
      if (!boundaryMatch) {
        resolve(null);
        return;
      }

      boundary = boundaryMatch[1];
      let buffer = Buffer.alloc(0);

      req.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
      });

      req.on("end", () => {
        try {
          // Simple multipart parser - extract the image data
          const boundaryBytes = Buffer.from(`--${boundary}`);
          const endBoundaryBytes = Buffer.from(`--${boundary}--`);

          // Find image content
          const contentDispositionIndex = buffer.indexOf(Buffer.from("Content-Disposition:"));
          const contentTypeIndex = buffer.indexOf(Buffer.from("Content-Type:"), contentDispositionIndex);
          
          if (contentTypeIndex === -1) {
            resolve(null);
            return;
          }

          // Extract Content-Type value
          const ctStartIndex = contentTypeIndex + "Content-Type:".length;
          const ctEndIndex = buffer.indexOf(Buffer.from("\r\n"), ctStartIndex);
          contentType = buffer.toString("utf-8", ctStartIndex, ctEndIndex).trim();

          // Find start of actual file data (after \r\n\r\n following headers)
          const headerEndIndex = buffer.indexOf(Buffer.from("\r\n\r\n"), contentTypeIndex);
          if (headerEndIndex === -1) {
            resolve(null);
            return;
          }

          const dataStartIndex = headerEndIndex + 4; // Skip \r\n\r\n
          
          // Find the next boundary (end of file data)
          const nextBoundaryIndex = buffer.indexOf(boundaryBytes, dataStartIndex);
          if (nextBoundaryIndex === -1) {
            resolve(null);
            return;
          }

          // Extract file data (excluding the trailing \r\n before boundary)
          imageBuffer = buffer.slice(dataStartIndex, nextBoundaryIndex - 2);

          resolve({ buffer: imageBuffer, contentType });
        } catch (error) {
          resolve(null);
        }
      });
    });
  };

  app.post("/api/upload-image", requireRole("admin"), async (req, res) => {
    try {
      const parsed = await parseMultipartImage(req);
      
      if (!parsed) {
        return res.status(400).json({ error: "Файл не загружен" });
      }

      const { buffer, contentType } = parsed;
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ error: "Только изображения разрешены (JPEG, PNG, WebP, GIF)" });
      }

      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Файл слишком большой (макс. 10MB)" });
      }

      const ext = contentType.split("/")[1];
      const fileName = `product-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const filePath = path.join(uploadsDir, fileName);

      fs.writeFileSync(filePath, buffer);

      const fileUrl = `/uploads/${fileName}`;
      res.json({ url: fileUrl });
    } catch (error) {
      res.status(500).json({ error: "Ошибка при загрузке файла" });
    }
  });

  app.get("/api/uploaded-images", requireRole("admin"), (req, res) => {
    try {
      const files = fs.readdirSync(uploadsDir);
      const images = files.map((file) => ({
        filename: file,
        url: `/uploads/${file}`,
      }));
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: "Ошибка при получении списка файлов" });
    }
  });

  // Admin orders
  app.get(api.orders.list.path, requireRole("admin"), async (_req, res) => {
    const orders = await storage.getOrders();
    res.json(orders);
  });

  app.patch(api.orders.updateStatus.path, requireRole("admin", "courier"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = statusSchema.parse(req.body);
      const actor = req.sessionUser!;
      const result = await storage.updateOrderStatus(id, status, { id: actor.id, role: actor.role });

      broadcastOrderEvent(id, result.event);
      res.json(result.order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректный статус заказа");
      }

      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }

        return sendValidationError(res, error.message);
      }

      throw error;
    }
  });

  // Customer endpoints
  app.post(api.orders.create.path, requireRole("customer"), async (req, res) => {
    try {
      const input = customerOrderSchema.parse(req.body);
      const result = await storage.createOrder(req.sessionUser!.id, input);

      broadcastOrderEvent(result.order.id, result.event);
      res.status(201).json({
        ...result.order,
        bonusSpent: result.bonusSpent ?? 0,
        bonusEarned: result.bonusEarned ?? 0,
      });
    } catch (e) {
      if (e instanceof z.ZodError) return sendValidationError(res, "Некорректные данные заказа");
      if (e instanceof Error) return sendValidationError(res, e.message);
      throw e;
    }
  });

  app.get("/api/customer/orders", requireRole("customer"), async (req, res) => {
    const orders = await storage.getCustomerOrders(req.sessionUser!.id);
    res.json(orders);
  });

  app.post("/api/customer/orders/:id/repeat", requireRole("customer"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await storage.repeatOrder(req.sessionUser!.id, id);

      broadcastOrderEvent(result.order.id, result.event);
      res.status(201).json(result.order);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }

        return sendValidationError(res, error.message);
      }

      throw error;
    }
  });

  app.delete("/api/customer/orders/:id", requireRole("customer"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteOrderByCustomer(id, req.sessionUser!.id);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }
        return sendValidationError(res, error.message);
      }
      throw error;
    }
  });

  app.get("/api/customer/saved-addresses", requireRole("customer"), async (req, res) => {
    const addresses = await storage.getCustomerSavedAddresses(req.sessionUser!.id);
    res.json(addresses);
  });

  app.get("/api/customer/orders/:id/timeline", requireRole("customer"), async (req, res) => {
    const id = Number(req.params.id);
    const order = await storage.getOrder(id);

    if (!order || order.customerId !== req.sessionUser!.id) {
      return sendNotFound(res, "Заказ не найден");
    }

    const timeline = await storage.getOrderTimeline(id);
    res.json(timeline);
  });

  app.get("/api/customer/orders/:id/events/stream", requireRole("customer"), async (req, res) => {
    const id = Number(req.params.id);
    const order = await storage.getOrder(id);

    if (!order || order.customerId !== req.sessionUser!.id) {
      return sendNotFound(res, "Заказ не найден");
    }

    setSseHeaders(res);
    subscribeOrderEvents(id, res);


    res.write(`event: connected\ndata: ${JSON.stringify({ orderId: id })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribeOrderEvents(id, res);
      res.end();
    });
  });

  // Customer bonus endpoints
  app.get("/api/customer/bonuses/balance", requireRole("customer"), async (req, res) => {
    try {
      const balance = await storage.getBonusBalance(req.sessionUser!.id);
      res.json({ balance });
    } catch (error) {
      if (error instanceof Error) {
        return sendValidationError(res, error.message);
      }
      throw error;
    }
  });

  app.get("/api/customer/bonuses/transactions", requireRole("customer"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit || "50"), 100);
      const transactions = await storage.getBonusTransactions(req.sessionUser!.id, limit);
      res.json(transactions);
    } catch (error) {
      if (error instanceof Error) {
        return sendValidationError(res, error.message);
      }
      throw error;
    }
  });

  const spendBonusSchema = z.object({
    amount: z.number().positive(),
    description: z.string().min(1).optional(),
  });

  app.post("/api/customer/bonuses/spend", requireRole("customer"), async (req, res) => {
    try {
      const input = spendBonusSchema.parse(req.body);
      const transaction = await storage.addBonusTransaction(
        req.sessionUser!.id,
        "spend",
        input.amount,
        input.description || "Использование бонусов",
      );
      res.json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные");
      }
      if (error instanceof Error) {
        return sendValidationError(res, error.message);
      }
      throw error;
    }
  });

  // Courier endpoints
  app.get("/api/courier/orders/available", requireRole("courier"), async (_req, res) => {
    const orders = await storage.getAvailableCourierOrders();
    res.json(orders);
  });

  app.get("/api/courier/orders/active", requireRole("courier"), async (req, res) => {
    const orders = await storage.getActiveCourierOrders(req.sessionUser!.id);
    res.json(orders);
  });

  app.post("/api/courier/orders/:id/accept", requireRole("courier"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await storage.acceptCourierOrder(id, req.sessionUser!.id);
      broadcastOrderEvent(id, result.event);
      res.json(result.order);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }

        return sendValidationError(res, error.message);
      }

      throw error;
    }
  });

  app.patch("/api/courier/orders/:id/status", requireRole("courier"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = statusSchema.parse(req.body);
      const result = await storage.updateOrderStatus(id, status, {
        id: req.sessionUser!.id,
        role: "courier",
      });

      broadcastOrderEvent(id, result.event);
      res.json(result.order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректный статус заказа");
      }

      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }

        return sendValidationError(res, error.message);
      }

      throw error;
    }
  });

  app.get("/api/courier/stats", requireRole("courier"), async (req, res) => {
    const parsed = courierStatsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return sendValidationError(res, "Некорректный период");
    }

    const stats = await storage.getCourierStats(req.sessionUser!.id, parsed.data.period);
    res.json(stats);
  });

  // Courier Schedule
  app.get("/api/courier/schedule", requireRole("courier"), async (req, res) => {
    try {
      const schedules = await db
        .select()
        .from(schema.courierSchedule)
        .where(eq(schema.courierSchedule.courierId, req.sessionUser!.id))
        .orderBy(asc(schema.courierSchedule.dayOfWeek));

      const scheduleData = schedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        timeSlots: s.timeSlots || [],
      }));

      res.json(scheduleData);
    } catch (error) {
      console.error("Error fetching courier schedule:", error);
      res.status(500).json({ message: "Не удалось загрузить график" });
    }
  });

  const courierScheduleSchema = z.object({
    dayOfWeek: z.string().min(1),
    timeSlots: z.array(z.string()).default([]),
  });

  app.post("/api/courier/schedule", requireRole("courier"), async (req, res) => {
    try {
      const parsed = courierScheduleSchema.parse(req.body);
      const courierId = req.sessionUser!.id;

      const existing = await db
        .select()
        .from(schema.courierSchedule)
        .where(
          and(
            eq(schema.courierSchedule.courierId, courierId),
            eq(schema.courierSchedule.dayOfWeek, parsed.dayOfWeek),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const updated = await db
          .update(schema.courierSchedule)
          .set({
            timeSlots: parsed.timeSlots,
            updatedAt: new Date(),
          })
          .where(eq(schema.courierSchedule.id, existing[0].id))
          .returning();

        return res.json(updated[0]);
      } else {
        const inserted = await db
          .insert(schema.courierSchedule)
          .values({
            courierId,
            dayOfWeek: parsed.dayOfWeek,
            timeSlots: parsed.timeSlots,
          })
          .returning();

        return res.json(inserted[0]);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные графика");
      }
      console.error("Error saving courier schedule:", error);
      res.status(500).json({ message: "Не удалось сохранить график" });
    }
  });

  // GPS Location endpoints for couriers
  const locationSchema = z.object({
    orderId: z.number().int().positive().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().optional(),
    speed: z.number().optional(),
    heading: z.number().optional(),
  });

  app.post("/api/courier/location", requireRole("courier"), async (req, res) => {
    try {
      const input = locationSchema.parse(req.body);
      const courierId = req.sessionUser!.id;

      const activeDeliveries = await db
        .select({
          orderId: schema.courierDeliveries.orderId,
          sequence: schema.courierDeliveries.deliverySequence,
        })
        .from(schema.courierDeliveries)
        .where(
          and(
            eq(schema.courierDeliveries.courierId, courierId),
            inArray(schema.courierDeliveries.status, ["pending", "picked_up"]),
          ),
        )
        .orderBy(asc(schema.courierDeliveries.deliverySequence));

      const activeOrderIds = activeDeliveries.map((delivery) => delivery.orderId);

      if (!activeOrderIds.length) {
        return sendValidationError(res, "У курьера нет активных доставок для GPS трансляции");
      }

      if (input.orderId && !activeOrderIds.includes(input.orderId)) {
        return sendValidationError(res, "Заказ не найден в активных доставках курьера", "orderId");
      }

      const inserted = await db
        .insert(schema.courierLocations)
        .values(activeOrderIds.map((activeOrderId) => ({
          courierId,
          orderId: activeOrderId,
          latitude: input.latitude.toString(),
          longitude: input.longitude.toString(),
          accuracy: input.accuracy === undefined ? null : input.accuracy.toString(),
          speed: input.speed === undefined ? null : input.speed.toString(),
          heading: input.heading === undefined ? null : input.heading.toString(),
        })))
        .returning();

      const locationsByOrderId = new Map(
        inserted.map((location) => [location.orderId, toCourierLocationPayload(location)]),
      );

      activeOrderIds.forEach((activeOrderId) => {
        const location = locationsByOrderId.get(activeOrderId);

        if (!location) {
          return;
        }

        broadcastOrderEvent(activeOrderId, {
          id: location.id,
          orderId: activeOrderId,
          actorId: courierId,
          actorRole: "courier",
          eventType: "location_update",
          eventMessage: `Курьер обновил GPS позицию`,
          metadata: {
            location,
          },
          createdAt: location.timestamp,
        });
      });

      const responseOrderId = input.orderId || activeOrderIds[0];
      res.json(locationsByOrderId.get(responseOrderId) || toCourierLocationPayload(inserted[0]));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные координаты GPS");
      }
      if (error instanceof Error) {
        return sendValidationError(res, error.message);
      }
      throw error;
    }
  });

  app.get("/api/orders/:id/courier-location", requireRole("customer"), async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const order = await storage.getOrder(orderId);

      if (!order || order.customerId !== req.sessionUser!.id) {
        return sendNotFound(res, "Заказ не найден");
      }

      if (!order.courierId || !["delivery", "returning"].includes(order.status)) {
        return res.json(null);
      }

      const lastLocation = await db
        .select()
        .from(schema.courierLocations)
        .where(
          and(
            eq(schema.courierLocations.courierId, order.courierId),
            eq(schema.courierLocations.orderId, orderId),
          ),
        )
        .orderBy(desc(schema.courierLocations.createdAt))
        .limit(1);

      if (!lastLocation.length) {
        return res.json(null);
      }

      const location = lastLocation[0];
      res.json(toCourierLocationPayload(location));
    } catch (error) {
      if (error instanceof Error) {
        return sendValidationError(res, error.message);
      }
      throw error;
    }
  });

  // Analytics
  app.get(api.analytics.summary.path, requireRole("admin"), async (_req, res) => {
    const summary = await storage.getAnalyticsSummary();
    res.json(summary);
  });

  app.get(api.analytics.export.path, requireRole("admin"), async (req, res) => {
    const parsed = exportQuerySchema.safeParse(req.query);
    const exportType = parsed.success ? parsed.data.type : "full";
    const summary = await storage.getAnalyticsSummary();
    const buf = buildAnalyticsWorkbookBuffer(summary, exportType);

    const fileName = `report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  // Promo codes
  app.post("/api/promo", (req, res) => {
    const { code, subtotal = 0 } = req.body as { code: string; subtotal: number };

    const promoCodes: Record<string, { discount: number; type: "percent" | "delivery" | "fixed"; label: string; minOrder?: number }> = {
      "НОВИНКА": { discount: 15, type: "percent", label: "Скидка 15% на первый заказ", minOrder: 0 },
      "FOODDASH": { discount: 10, type: "percent", label: "Скидка 10% на заказ", minOrder: 500 },
      "ЛЕТО25": { discount: 25, type: "percent", label: "Летняя акция 25%", minOrder: 800 },
      "ДОСТАВКА": { discount: 0, type: "delivery", label: "Бесплатная доставка", minOrder: 0 },
      "ПИЦЦА20": { discount: 20, type: "percent", label: "Скидка 20% на пиццу", minOrder: 400 },
      "ДРУГ": { discount: 200, type: "fixed", label: "Скидка 200 ₽ за приглашение", minOrder: 1000 },
    };

    const promo = promoCodes[code?.toUpperCase()?.trim() || ""];
    if (!promo) {
      return res.json({ valid: false, message: "Промокод не найден или устарел" });
    }

    if (promo.minOrder && subtotal < promo.minOrder) {
      return res.json({ valid: false, message: `Минимальная сумма заказа для этого промокода — ${promo.minOrder} ₽` });
    }

    return res.json({ valid: true, ...promo });
  });

  // AI assistant with personal account contact option
  app.post("/api/chat", async (req, res) => {
    const { message, products: clientProducts } = req.body as { message: string; products: any[] };
    const allProducts = await storage.getProducts();
    const productList = allProducts.length > 0 ? allProducts : clientProducts || [];
    const msg = (message || "").toLowerCase().trim();

    if (!msg) {
      return res.json({ reply: "Напишите ваш вопрос — помогу с меню, доставкой и заказом." });
    }

    // Handle manager contact requests - direct to personal account
    const wantsManager = /(менедж|оператор|поддержк|человек|связаться|связь|консультант|вас|контакт)/i.test(msg);
    if (wantsManager) {
      return res.json({
        reply: "Для связи с менеджером откройте свой личный кабинет — там вы найдёте контактную информацию и сможете оставить сообщение. Я помогу вам с информацией о меню, доставке и акциях! 😊",
      });
    }

    // Handle "What's cheaper?" question
    if (/(что дешев|дешев|дешевле|цена|стоим|самый дешев)/i.test(msg)) {
      const cheapest = productList.sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 3);
      if (cheapest.length > 0) {
        const preview = cheapest.map((product) => `• ${product.name} — ${Number(product.price).toFixed(0)} ₽`).join("\n");
        return res.json({
          reply: `Вот самые доступные блюда:\n${preview}\n\nХотите узнать больше о каком-нибудь из них?`,
        });
      }
      return res.json({
        reply: "К сожалению, не смог найти информацию о ценах. Попробуйте позже или обратитесь к менеджеру в личном кабинете.",
      });
    }

    // Handle "Without meat" question
    if (/(мяс|вегетари|овощ|без мяса|постн|веган)/i.test(msg)) {
      const vegetarian = productList.filter((product) => {
        const text = `${product.name} ${product.description || ""} ${product.category || ""}`.toLowerCase();
        return /(овощ|веган|вегетари|постн|без мяса)/i.test(text);
      });
      if (vegetarian.length > 0) {
        const preview = vegetarian.slice(0, 3).map((product) => `• ${product.name} — ${Number(product.price).toFixed(0)} ₽`).join("\n");
        return res.json({
          reply: `Вот вегетарианские блюда:\n${preview}\n\nЭто отличный выбор! 🌱`,
        });
      }
      return res.json({
        reply: "К сожалению, сейчас нет специально отмеченных вегетарианских блюд. Но я могу помочь найти что-то по вашему описанию — расскажите подробнее, что вам нравится!",
      });
    }

    // Handle "Sales/Promotions" question
    if (/(акц|скидк|промокод|скидка|акция|спец предложение|выгодно)/i.test(msg)) {
      return res.json({
        reply: "Используйте промокоды для экономии:\n• НОВИНКА — 15% на первый заказ\n• FOODDASH — 10% скидка\n• ЛЕТО25 — 25% летняя акция\n• ДОСТАВКА — бесплатная доставка\n• ПИЦЦА20 — 20% на пиццу\n• ДРУГ — 200 ₽ за приглашение\n\nПрименяйте коды в корзине! 🎉",
      });
    }

    // Handle "Delivery" question
    if (/(доставк|когда|сколько ждать|время доставк|как долго|скорост)/i.test(msg)) {
      return res.json({
        reply: "⏱️ Доставка обычно занимает 30–60 минут.\n💰 При заказе от 1500 ₽ доставка бесплатная.\n🚚 Отслеживайте ваш заказ в личном кабинете в реальном времени.",
      });
    }

    // Handle "Recommend!" question
    if (/(рекомендуй|посовет|лучше|популярн|топ|хит|блюдо дня|что попробовать|что выбрать)/i.test(msg)) {
      const popular = productList.slice(0, 3);
      if (popular.length > 0) {
        const preview = popular.map((product) => `• ${product.name} — ${Number(product.price).toFixed(0)} ₽`).join("\n");
        return res.json({
          reply: `Мои рекомендации — хиты нашего меню:\n${preview}\n\nЭти блюда очень популярны! Закажите и попробуйте сами 👨‍🍳`,
        });
      }
      return res.json({
        reply: "К сожалению, не смог получить рекомендации. Попробуйте позже или выберите блюдо по вкусу — я помогу подсказать цену и доставку!",
      });
    }

    const matched = productList.filter((product) => {
      const text = `${product.name} ${product.description || ""} ${product.category || ""}`.toLowerCase();
      return msg.split(/\s+/).some((token) => token.length > 2 && text.includes(token));
    });

    if (matched.length > 0) {
      const preview = matched
        .slice(0, 3)
        .map((product) => `• ${product.name} — ${Number(product.price).toFixed(0)} ₽`)
        .join("\n");

      return res.json({
        reply: `Подобрал несколько вариантов:\n${preview}\n\nЕсли хотите, помогу выбрать лучший вариант под ваш бюджет.`,
      });
    }

    return res.json({
      reply: "Я помогу вам найти блюдо, узнать о доставке, акциях и скидках. Расскажите, что вы ищете или какой вопрос вас интересует! 😊",
    });
  });

  // Register courier delivery routes
  registerCourierDeliveryRoutes(app, broadcastOrderEvent);

  // Register cancellation routes
  registerCancellationRoutes(app);

  // Register admin order routes
  registerAdminOrderRoutes(app);

  await seedData();

  return httpServer;
}
