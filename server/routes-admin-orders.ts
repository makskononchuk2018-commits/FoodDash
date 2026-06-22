import type { Express, Request, Response } from "express";
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
  type OrderStatus,
} from "@shared/schema";
import { requireRole } from "./auth";
import { sendConflict, sendNotFound, sendValidationError } from "./api-utils";
import { db } from "./db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ACTIVE_DELIVERY_STATUSES,
  getActiveCourierDeliveries,
  moveDeliveryToSequence,
  resequenceCourierDeliveries,
  saveCourierDeliveryOrder,
} from "./delivery-sequence";

const reassignOrderSchema = z.object({
  courierId: z.number().int().positive(),
  deliverySequence: z.number().int().min(1).max(3).optional(),
});

const updateDeliverySequenceSchema = z.object({
  newSequence: z.number().int().min(1).max(3),
});

const removeOrderItemSchema = z.object({
  orderItemId: z.number().int().positive(),
  reason: z.string().min(1).max(500).optional(),
});

function parsePositiveId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function registerAdminOrderRoutes(app: Express) {
  app.get("/api/admin/orders", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
      const lastActionAtSql = sql<Date>`GREATEST(
        COALESCE(
          (SELECT MAX(${orderEvents.createdAt}) FROM ${orderEvents} WHERE ${orderEvents.orderId} = ${orders.id}),
          ${orders.createdAt}
        ),
        ${orders.updatedAt},
        ${orders.createdAt}
      )`;
      const activeRouteSizeSql = sql<number>`COALESCE(
        (
          SELECT COUNT(*)::int
          FROM ${courierDeliveries} active_delivery
          WHERE active_delivery.courier_id = ${orders.courierId}
            AND active_delivery.status IN ('pending', 'picked_up')
        ),
        0
      )`;

      const allOrders = await db
        .select({
          id: orders.id,
          customerId: orders.customerId,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          customerAddress: orders.customerAddress,
          totalAmount: orders.totalAmount,
          status: orders.status,
          courierId: orders.courierId,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          lastActionAt: lastActionAtSql,
          courier: {
            id: users.id,
            fullName: users.fullName,
            username: users.username,
            phone: users.phone,
          },
          deliveryInfo: {
            id: courierDeliveries.id,
            sequence: courierDeliveries.deliverySequence,
            deliveryStatus: courierDeliveries.status,
            routeSize: activeRouteSizeSql,
          },
        })
        .from(orders)
        .leftJoin(users, eq(orders.courierId, users.id))
        .leftJoin(
          courierDeliveries,
          and(
            eq(courierDeliveries.orderId, orders.id),
            inArray(courierDeliveries.status, ACTIVE_DELIVERY_STATUSES),
          ),
        )
        .where(statusFilter && statusFilter !== "all" ? eq(orders.status, statusFilter as OrderStatus) : undefined)
        .orderBy(desc(lastActionAtSql), desc(orders.createdAt));

      res.json(allOrders);
    } catch (error) {
      console.error("Error fetching admin orders:", error);
      res.status(500).json({ message: "Не удалось загрузить заказы" });
    }
  });

  app.post("/api/admin/orders/:id/reassign", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const orderId = parsePositiveId(req.params.id);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      const parsed = reassignOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, "Некорректные данные назначения");
      }

      const { courierId, deliverySequence } = parsed.data;

      const delivery = await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (!order) {
          throw new Error("Заказ не найден");
        }

        if (["completed", "cancelled"].includes(order.status)) {
          throw new Error("Нельзя назначить курьера на завершенный или отмененный заказ");
        }

        const [courier] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, courierId), eq(users.role, "courier"), eq(users.isDeleted, false)))
          .limit(1);

        if (!courier) {
          throw new Error("Курьер не найден");
        }

        const [existingActiveDelivery] = await tx
          .select()
          .from(courierDeliveries)
          .where(
            and(
              eq(courierDeliveries.orderId, orderId),
              inArray(courierDeliveries.status, ACTIVE_DELIVERY_STATUSES),
            ),
          )
          .limit(1);

        if (existingActiveDelivery) {
          await tx.delete(courierDeliveries).where(eq(courierDeliveries.id, existingActiveDelivery.id));
          await resequenceCourierDeliveries(tx, existingActiveDelivery.courierId);
        }

        const activeForCourier = await resequenceCourierDeliveries(tx, courierId);

        if (activeForCourier.length >= 3) {
          throw new Error("У этого курьера уже 3 активные доставки");
        }

        const appendSequence = activeForCourier.length + 1;
        const targetSequence = Math.min(deliverySequence ?? appendSequence, appendSequence);

        const [createdDelivery] = await tx
          .insert(courierDeliveries)
          .values({
            courierId,
            orderId,
            deliverySequence: appendSequence,
            deliveryAddress: order.customerAddress,
            status: "pending",
          })
          .returning();

        let finalDelivery = createdDelivery;
        if (targetSequence !== appendSequence) {
          const nextActiveForCourier = [...activeForCourier, createdDelivery];
          const updatedOrder = moveDeliveryToSequence(nextActiveForCourier, createdDelivery.id, targetSequence);
          await saveCourierDeliveryOrder(tx, updatedOrder);
          const [updatedDelivery] = await tx
            .select()
            .from(courierDeliveries)
            .where(eq(courierDeliveries.id, createdDelivery.id))
            .limit(1);
          finalDelivery = updatedDelivery || createdDelivery;
        }

        await tx
          .update(orders)
          .set({ courierId, status: "delivery", updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderEvents).values({
          orderId,
          actorId: req.sessionUser!.id,
          actorRole: "admin",
          eventType: "admin_courier_assigned",
          eventMessage: `Администратор назначил курьера: ${courier.fullName}`,
          metadata: { courierId, deliverySequence: finalDelivery.deliverySequence },
        });

        return finalDelivery;
      });

      res.json({ success: true, message: "Заказ назначен курьеру", delivery });
    } catch (error) {
      console.error("Error reassigning order:", error);
      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }
        if (error.message.includes("3 активные") || error.message.includes("Нельзя")) {
          return sendConflict(res, error.message);
        }
      }

      res.status(500).json({ message: "Не удалось назначить курьера" });
    }
  });

  app.post("/api/admin/orders/:id/unassign", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const orderId = parsePositiveId(req.params.id);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      await db.transaction(async (tx) => {
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
          await tx.delete(courierDeliveries).where(eq(courierDeliveries.id, activeDelivery.id));
          await resequenceCourierDeliveries(tx, activeDelivery.courierId);
        }

        await tx
          .update(orders)
          .set({ courierId: null, updatedAt: new Date() })
          .where(eq(orders.id, orderId));
      });

      res.json({ success: true, message: "Курьер снят с заказа" });
    } catch (error) {
      console.error("Error unassigning order:", error);
      res.status(500).json({ message: "Не удалось снять курьера" });
    }
  });

  app.get("/api/admin/courier-deliveries/:courierId", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const courierId = parsePositiveId(req.params.courierId);
      if (!courierId) {
        return sendValidationError(res, "Некорректный ID курьера");
      }

      const deliveries = await db
        .select({
          id: courierDeliveries.id,
          orderId: courierDeliveries.orderId,
          sequence: courierDeliveries.deliverySequence,
          status: courierDeliveries.status,
          deliveryAddress: courierDeliveries.deliveryAddress,
          startedAt: courierDeliveries.startedAt,
          completedAt: courierDeliveries.completedAt,
          order: {
            id: orders.id,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            totalAmount: orders.totalAmount,
            status: orders.status,
          },
        })
        .from(courierDeliveries)
        .leftJoin(orders, eq(courierDeliveries.orderId, orders.id))
        .where(eq(courierDeliveries.courierId, courierId))
        .orderBy(asc(courierDeliveries.deliverySequence), desc(courierDeliveries.createdAt));

      res.json(deliveries);
    } catch (error) {
      console.error("Error fetching courier deliveries:", error);
      res.status(500).json({ message: "Не удалось загрузить доставки курьера" });
    }
  });

  app.put("/api/admin/courier-deliveries/:id/sequence", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const deliveryId = parsePositiveId(req.params.id);
      if (!deliveryId) {
        return sendValidationError(res, "РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ ID РґРѕСЃС‚Р°РІРєРё");
      }

      const parsed = updateDeliverySequenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, "РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РїРѕР·РёС†РёСЏ РґРѕСЃС‚Р°РІРєРё");
      }

      const { newSequence } = parsed.data;

      const updated = await db.transaction(async (tx) => {
        const [delivery] = await tx
          .select()
          .from(courierDeliveries)
          .where(eq(courierDeliveries.id, deliveryId))
          .limit(1);

        if (!delivery) {
          throw new Error("Р”РѕСЃС‚Р°РІРєР° РЅРµ РЅР°Р№РґРµРЅР°");
        }

        if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
          throw new Error("РњРµРЅСЏС‚СЊ РјРµСЃС‚Р°РјРё РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ Р°РєС‚РёРІРЅС‹Рµ РґРѕСЃС‚Р°РІРєРё");
        }

        const active = await getActiveCourierDeliveries(tx, delivery.courierId);
        const current = active.find((item: typeof courierDeliveries.$inferSelect) => item.id === deliveryId);

        if (!current) {
          throw new Error("Р”РѕСЃС‚Р°РІРєР° РЅРµ РЅР°Р№РґРµРЅР° РІ Р°РєС‚РёРІРЅРѕРј РјР°СЂС€СЂСѓС‚Рµ");
        }

        const updatedOrder = moveDeliveryToSequence(active, deliveryId, newSequence);
        await saveCourierDeliveryOrder(tx, updatedOrder);

        const [updatedDelivery] = await tx
          .select()
          .from(courierDeliveries)
          .where(eq(courierDeliveries.id, deliveryId))
          .limit(1);

        await tx
          .update(orders)
          .set({ updatedAt: new Date() })
          .where(eq(orders.id, delivery.orderId));

        await tx.insert(orderEvents).values({
          orderId: delivery.orderId,
          actorId: req.sessionUser!.id,
          actorRole: "admin",
          eventType: "admin_delivery_reordered",
          eventMessage: "РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РёР·РјРµРЅРёР» РїРѕР·РёС†РёСЋ Р·Р°РєР°Р·Р° Сѓ РєСѓСЂСЊРµСЂР°",
          metadata: {
            deliveryId,
            courierId: delivery.courierId,
            oldSequence: delivery.deliverySequence,
            newSequence: updatedDelivery?.deliverySequence ?? newSequence,
          },
        });

        return updatedDelivery;
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating courier delivery sequence:", error);
      if (error instanceof Error) {
        if (error.message.includes("РЅРµ РЅР°Р№РґРµРЅ")) {
          return sendNotFound(res, error.message);
        }
        if (error.message.includes("Р°РєС‚РёРІРЅ")) {
          return sendConflict(res, error.message);
        }
      }

      res.status(500).json({ message: "РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ РїРѕР·РёС†РёСЋ РґРѕСЃС‚Р°РІРєРё" });
    }
  });

  app.get("/api/admin/order-items/:orderId", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const orderId = parsePositiveId(req.params.orderId);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      const currentItems = await db
        .select({
          id: orderItems.id,
          quantity: orderItems.quantity,
          price: orderItems.price,
          product: {
            id: products.id,
            name: products.name,
            price: products.price,
          },
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, orderId));

      const removedItems = await db
        .select({
          id: orderItemsRemoved.id,
          quantity: orderItemsRemoved.quantity,
          price: orderItemsRemoved.price,
          reason: orderItemsRemoved.reason,
          removedByRole: orderItemsRemoved.removedByRole,
          removedBy: {
            id: users.id,
            fullName: users.fullName,
          },
          createdAt: orderItemsRemoved.createdAt,
          product: {
            id: products.id,
            name: products.name,
          },
        })
        .from(orderItemsRemoved)
        .leftJoin(users, eq(orderItemsRemoved.removedById, users.id))
        .leftJoin(products, eq(orderItemsRemoved.productId, products.id))
        .where(eq(orderItemsRemoved.orderId, orderId));

      res.json({ current: currentItems, removed: removedItems });
    } catch (error) {
      console.error("Error fetching order items:", error);
      res.status(500).json({ message: "Не удалось загрузить позиции заказа" });
    }
  });

  app.post("/api/admin/order-items/:orderId/remove", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const orderId = parsePositiveId(req.params.orderId);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      const parsed = removeOrderItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(res, "Некорректные данные");
      }

      const { orderItemId, reason } = parsed.data;

      await db.transaction(async (tx) => {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const item = items.find((row: typeof orderItems.$inferSelect) => row.id === orderItemId);

        if (!item) {
          throw new Error("Позиция заказа не найдена");
        }

        if (items.length <= 1) {
          throw new Error("Нельзя удалить последний товар. Отмените заказ целиком");
        }

        await tx.insert(orderItemsRemoved).values({
          orderId,
          orderItemId,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          removedById: req.sessionUser!.id,
          removedByRole: "admin",
          reason: reason || null,
        });

        await tx.delete(orderItems).where(eq(orderItems.id, orderItemId));

        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));

        const remainingTotal = items
          .filter((row: typeof orderItems.$inferSelect) => row.id !== orderItemId)
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
            orderItemId,
            productId: item.productId,
            quantity: item.quantity,
            reason: reason || null,
          },
        });
      });

      res.json({ success: true, message: "Товар удален из заказа" });
    } catch (error) {
      console.error("Error removing order item:", error);
      if (error instanceof Error && error.message.includes("не найдена")) {
        return sendNotFound(res, error.message);
      }
      if (error instanceof Error && error.message.includes("Нельзя")) {
        return sendConflict(res, error.message);
      }
      res.status(500).json({ message: "Не удалось удалить товар" });
    }
  });

  app.get("/api/admin/order-cancellations/:orderId", requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const orderId = parsePositiveId(req.params.orderId);
      if (!orderId) {
        return sendValidationError(res, "Некорректный ID заказа");
      }

      const cancellation = await db
        .select({
          id: orderCancellations.id,
          orderId: orderCancellations.orderId,
          cancelledByRole: orderCancellations.cancelledByRole,
          reasonKey: orderCancellations.reasonKey,
          reasonDetails: orderCancellations.reasonDetails,
          cancelledBy: {
            id: users.id,
            fullName: users.fullName,
          },
          reason: {
            id: deliveryReasons.id,
            reasonText: deliveryReasons.reasonText,
            category: deliveryReasons.category,
          },
          createdAt: orderCancellations.createdAt,
        })
        .from(orderCancellations)
        .leftJoin(users, eq(orderCancellations.cancelledById, users.id))
        .leftJoin(
          deliveryReasons,
          and(
            eq(deliveryReasons.reasonKey, orderCancellations.reasonKey),
            eq(deliveryReasons.role, orderCancellations.cancelledByRole),
          ),
        )
        .where(eq(orderCancellations.orderId, orderId));

      res.json(cancellation[0] || null);
    } catch (error) {
      console.error("Error fetching cancellation info:", error);
      res.status(500).json({ message: "Не удалось загрузить информацию об отмене" });
    }
  });

  app.get("/api/admin/delivery-reasons", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const reasons = await db
        .select()
        .from(deliveryReasons)
        .where(eq(deliveryReasons.isActive, true))
        .orderBy(asc(deliveryReasons.role), asc(deliveryReasons.category));

      res.json(reasons);
    } catch (error) {
      console.error("Error fetching delivery reasons:", error);
      res.status(500).json({ message: "Не удалось загрузить причины" });
    }
  });

  app.get("/api/admin/couriers", requireRole("admin"), async (_req: Request, res: Response) => {
    try {
      const allCouriers = await db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          phone: users.phone,
          email: users.email,
        })
        .from(users)
        .where(and(eq(users.role, "courier"), eq(users.isDeleted, false)))
        .orderBy(asc(users.fullName));

      const couriersWithDeliveries = await Promise.all(
        allCouriers.map(async (courier) => {
          const [deliveryCount] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(courierDeliveries)
            .where(
              and(
                eq(courierDeliveries.courierId, courier.id),
                inArray(courierDeliveries.status, ACTIVE_DELIVERY_STATUSES),
              ),
            );

          const activeDeliveries = Number(deliveryCount?.count || 0);

          return {
            ...courier,
            activeDeliveries,
            isAvailable: activeDeliveries < 3,
          };
        }),
      );

      res.json(couriersWithDeliveries);
    } catch (error) {
      console.error("Error fetching couriers:", error);
      res.status(500).json({ message: "Не удалось загрузить список курьеров" });
    }
  });
}
