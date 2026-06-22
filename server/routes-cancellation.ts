import type { Express } from "express";
import { z } from "zod";
import {
  courierDeliveries,
  deliveryReasons,
  orderCancellations,
  orderEvents,
  orderItems,
  orderItemsRemoved,
  orders,
  products,
  users,
  type DeliveryStatus,
} from "@shared/schema";
import { requireAuth, requireRole } from "./auth";
import { sendConflict, sendNotFound, sendValidationError } from "./api-utils";
import { db } from "./db";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = ["pending", "picked_up"];

const cancelOrderSchema = z.object({
  reasonKey: z.string().min(1),
  reasonDetails: z.string().min(10).max(1000),
});

const removeItemSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

const cancellationReasonsQuerySchema = z.object({
  role: z.enum(["customer", "courier", "admin"]).optional(),
});

const adminCancellationsQuerySchema = z.object({
  orderId: z.coerce.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  cancelledByRole: z.enum(["customer", "courier", "admin"]).optional(),
});

function parsePositiveId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function registerCancellationRoutes(app: Express) {
  app.post("/api/orders/:id/cancel", requireAuth, async (req, res) => {
    try {
      const orderId = parsePositiveId(req.params.id);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      const parsed = cancelOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, "Выберите причину и опишите отмену минимум в 10 символов");
      }

      const { reasonKey, reasonDetails } = parsed.data;
      const userId = req.sessionUser!.id;
      const userRole = req.sessionUser!.role;

      const result = await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);

        if (!order) {
          throw new Error("Заказ не найден");
        }

        if (order.status === "cancelled") {
          throw new Error("Заказ уже отменен");
        }

        if (order.status === "completed") {
          throw new Error("Доставленный заказ нельзя отменить");
        }

        if (userRole === "customer") {
          if (order.customerId !== userId) {
            throw new Error("Вы не можете отменить чужой заказ");
          }

          if (order.status !== "new" || order.courierId) {
            throw new Error("Заказ можно отменить только до передачи курьеру");
          }

          const [activeDelivery] = await tx
            .select()
            .from(courierDeliveries)
            .where(
              and(
                eq(courierDeliveries.orderId, orderId),
                inArray(courierDeliveries.status, ACTIVE_DELIVERY_STATUSES),
              ),
            )
            .limit(1);

          if (activeDelivery) {
            throw new Error("Заказ уже передан курьеру");
          }
        }

        if (userRole === "courier") {
          const [activeDelivery] = await tx
            .select()
            .from(courierDeliveries)
            .where(
              and(
                eq(courierDeliveries.courierId, userId),
                eq(courierDeliveries.orderId, orderId),
                inArray(courierDeliveries.status, ACTIVE_DELIVERY_STATUSES),
              ),
            )
            .limit(1);

          if (!activeDelivery) {
            throw new Error("У вас нет активной доставки для этого заказа");
          }

          await tx
            .update(courierDeliveries)
            .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
            .where(eq(courierDeliveries.id, activeDelivery.id));
        }

        const [existingCancellation] = await tx
          .select()
          .from(orderCancellations)
          .where(eq(orderCancellations.orderId, orderId))
          .limit(1);

        if (existingCancellation) {
          throw new Error("Этот заказ уже отменен");
        }

        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }

        const [cancellation] = await tx
          .insert(orderCancellations)
          .values({
            orderId,
            cancelledById: userId,
            cancelledByRole: userRole,
            reasonKey,
            reasonDetails,
          })
          .returning();

        await tx
          .update(orders)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderEvents).values({
          orderId,
          actorId: userId,
          actorRole: userRole,
          eventType: "order_cancelled",
          eventMessage: "Заказ отменен",
          metadata: { reasonKey, reasonDetails },
        });

        return cancellation;
      });

      res.json({ success: true, cancellation: result });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }
        return sendConflict(res, error.message);
      }

      throw error;
    }
  });

  app.delete("/api/orders/:id", requireRole("customer"), async (req, res) => {
    try {
      const orderId = parsePositiveId(req.params.id);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

      if (!order) {
        return sendNotFound(res, "Заказ не найден");
      }

      if (order.customerId !== req.sessionUser!.id) {
        return res.status(403).json({ message: "Вы не можете удалить чужой заказ" });
      }

      if (order.status !== "completed") {
        return sendConflict(res, "Можно удалить только доставленный заказ");
      }

      await db
        .update(orders)
        .set({
          isDeletedByCustomer: true,
          deletedByCustomerAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      res.json({ success: true, message: "Заказ удален из истории" });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ message: "Не удалось удалить заказ" });
    }
  });

  app.get("/api/orders/cancellation-reasons", requireAuth, async (req, res) => {
    try {
      const parsed = cancellationReasonsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendValidationError(res, "Некорректные параметры");
      }

      const roleFilter = parsed.data.role || req.sessionUser!.role;
      const reasons = await db
        .select()
        .from(deliveryReasons)
        .where(and(eq(deliveryReasons.role, roleFilter), eq(deliveryReasons.isActive, true)))
        .orderBy(desc(deliveryReasons.createdAt));

      res.json(
        reasons.map((reason) => ({
          reasonKey: reason.reasonKey,
          reasonText: reason.reasonText,
          category: reason.category,
        })),
      );
    } catch (error) {
      console.error("Error fetching cancellation reasons:", error);
      res.status(500).json({ message: "Не удалось загрузить причины отмены" });
    }
  });

  app.get("/api/admin/cancellations", requireRole("admin"), async (req, res) => {
    try {
      const parsed = adminCancellationsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendValidationError(res, "Некорректные параметры фильтрации");
      }

      const filters = parsed.data;
      const whereConditions = [];

      if (filters.orderId) whereConditions.push(eq(orderCancellations.orderId, filters.orderId));
      if (filters.startDate) whereConditions.push(gte(orderCancellations.createdAt, new Date(filters.startDate)));
      if (filters.endDate) whereConditions.push(lte(orderCancellations.createdAt, new Date(filters.endDate)));
      if (filters.cancelledByRole) whereConditions.push(eq(orderCancellations.cancelledByRole, filters.cancelledByRole));

      const cancellations = await db
        .select({
          id: orderCancellations.id,
          orderId: orderCancellations.orderId,
          cancelledById: orderCancellations.cancelledById,
          cancelledByRole: orderCancellations.cancelledByRole,
          reasonKey: orderCancellations.reasonKey,
          reasonDetails: orderCancellations.reasonDetails,
          createdAt: orderCancellations.createdAt,
          order: {
            id: orders.id,
            customerId: orders.customerId,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            customerAddress: orders.customerAddress,
            totalAmount: orders.totalAmount,
            status: orders.status,
          },
          canceller: {
            id: users.id,
            username: users.username,
            fullName: users.fullName,
          },
          reason: {
            reasonText: deliveryReasons.reasonText,
            category: deliveryReasons.category,
          },
        })
        .from(orderCancellations)
        .leftJoin(orders, eq(orderCancellations.orderId, orders.id))
        .leftJoin(users, eq(orderCancellations.cancelledById, users.id))
        .leftJoin(
          deliveryReasons,
          and(
            eq(deliveryReasons.reasonKey, orderCancellations.reasonKey),
            eq(deliveryReasons.role, orderCancellations.cancelledByRole),
          ),
        )
        .where(whereConditions.length ? and(...whereConditions) : undefined)
        .orderBy(desc(orderCancellations.createdAt));

      res.json(cancellations);
    } catch (error) {
      console.error("Error fetching admin cancellations:", error);
      res.status(500).json({ message: "Не удалось загрузить отмены" });
    }
  });

  app.get("/api/admin/returns", requireRole("admin"), async (_req, res) => {
    try {
      const removedItems = await db
        .select({
          id: orderItemsRemoved.id,
          orderId: orderItemsRemoved.orderId,
          orderItemId: orderItemsRemoved.orderItemId,
          productId: orderItemsRemoved.productId,
          quantity: orderItemsRemoved.quantity,
          price: orderItemsRemoved.price,
          removedById: orderItemsRemoved.removedById,
          removedByRole: orderItemsRemoved.removedByRole,
          reason: orderItemsRemoved.reason,
          createdAt: orderItemsRemoved.createdAt,
          product: {
            id: products.id,
            name: products.name,
            price: products.price,
          },
          order: {
            id: orders.id,
            customerId: orders.customerId,
            customerName: orders.customerName,
            totalAmount: orders.totalAmount,
            status: orders.status,
          },
          removedBy: {
            id: users.id,
            username: users.username,
            fullName: users.fullName,
          },
        })
        .from(orderItemsRemoved)
        .leftJoin(products, eq(orderItemsRemoved.productId, products.id))
        .leftJoin(orders, eq(orderItemsRemoved.orderId, orders.id))
        .leftJoin(users, eq(orderItemsRemoved.removedById, users.id))
        .orderBy(desc(orderItemsRemoved.createdAt));

      res.json(removedItems);
    } catch (error) {
      console.error("Error fetching admin returns:", error);
      res.status(500).json({ message: "Не удалось загрузить возвраты" });
    }
  });

  app.post("/api/admin/orders/:id/remove-item/:itemId", requireRole("admin"), async (req, res) => {
    try {
      const orderId = parsePositiveId(req.params.id);
      const itemId = parsePositiveId(req.params.itemId);

      if (!orderId || !itemId) {
        return sendValidationError(res, "Некорректные ID");
      }

      const parsed = removeItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, "Некорректные данные");
      }

      await db.transaction(async (tx) => {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const item = items.find((row: typeof orderItems.$inferSelect) => row.id === itemId);

        if (!item) {
          throw new Error("Позиция в заказе не найдена");
        }

        if (items.length <= 1) {
          throw new Error("Нельзя удалить последний товар. Отмените заказ целиком");
        }

        await tx.insert(orderItemsRemoved).values({
          orderId,
          orderItemId: itemId,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          removedById: req.sessionUser!.id,
          removedByRole: "admin",
          reason: parsed.data.reason || null,
        });

        await tx.delete(orderItems).where(eq(orderItems.id, itemId));

        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));

        const remainingTotal = items
          .filter((row: typeof orderItems.$inferSelect) => row.id !== itemId)
          .reduce((sum: number, row: typeof orderItems.$inferSelect) => sum + Number(row.price) * row.quantity, 0);

        await tx
          .update(orders)
          .set({ status: "returning", totalAmount: remainingTotal.toFixed(2), updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderEvents).values({
          orderId,
          actorId: req.sessionUser!.id,
          actorRole: "admin",
          eventType: "item_returned",
          eventMessage: "Товар удален из заказа и возвращен на склад",
          metadata: {
            orderItemId: itemId,
            productId: item.productId,
            quantity: item.quantity,
            reason: parsed.data.reason || null,
          },
        });
      });

      res.json({ success: true, message: "Позиция удалена из заказа" });
    } catch (error) {
      console.error("Error removing order item:", error);
      if (error instanceof Error && error.message.includes("не найдена")) {
        return sendNotFound(res, error.message);
      }
      if (error instanceof Error && error.message.includes("Нельзя")) {
        return sendConflict(res, error.message);
      }
      res.status(500).json({ message: "Не удалось удалить позицию" });
    }
  });
}
