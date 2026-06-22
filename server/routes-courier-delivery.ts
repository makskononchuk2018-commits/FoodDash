import type { Express } from "express";
import { z } from "zod";
import {
  courierDeliveries,
  orderCancellations,
  orderEvents,
  orderItems,
  orderItemsRemoved,
  orders,
  products,
} from "@shared/schema";
import { requireRole } from "./auth";
import { sendConflict, sendNotFound, sendValidationError } from "./api-utils";
import { db } from "./db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  ACTIVE_DELIVERY_STATUSES,
  getActiveCourierDeliveries,
  moveDeliveryToSequence,
  resequenceCourierDeliveries,
  saveCourierDeliveryOrder,
} from "./delivery-sequence";

const acceptDeliverySchema = z.object({
  orderId: z.number().int().positive(),
});

const updateSequenceSchema = z.object({
  newSequence: z.number().int().min(1).max(3),
});

const updateStatusSchema = z.object({
  status: z.enum(["picked_up", "delivered", "cancelled"]),
  reasonKey: z.string().min(1).optional(),
  reasonDetails: z.string().max(1000).optional().nullable(),
});

const removeItemSchema = z.object({
  reasonKey: z.string().min(1).default("defect"),
  reasonDetails: z.string().min(3).max(1000),
});

type BroadcastOrderEvent = (orderId: number, payload: unknown) => void;

function isActiveDelivery(status: string) {
  return ACTIVE_DELIVERY_STATUSES.some((activeStatus) => activeStatus === status);
}

async function loadItems(orderId: number) {
  const rows = await db
    .select({
      item: orderItems,
      product: {
        id: products.id,
        name: products.name,
        price: products.price,
        imageUrl: products.imageUrl,
      },
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));

  return rows.map((row) => ({
    ...row.item,
    price: String(row.item.price),
    product: row.product,
  }));
}

async function addOrderEvent(
  executor: any,
  payload: {
    orderId: number;
    actorId: number;
    eventType: string;
    eventMessage: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [event] = await executor
    .insert(orderEvents)
    .values({
      orderId: payload.orderId,
      actorId: payload.actorId,
      actorRole: "courier",
      eventType: payload.eventType,
      eventMessage: payload.eventMessage,
      metadata: payload.metadata ?? {},
    })
    .returning();

  return event;
}

export function registerCourierDeliveryRoutes(app: Express, broadcastOrderEvent?: BroadcastOrderEvent) {
  app.get("/api/courier/active-deliveries", requireRole("courier"), async (req, res) => {
    try {
      const courierId = req.sessionUser!.id;
      const active = await getActiveCourierDeliveries(db, courierId);

      const response = await Promise.all(
        active.map(async (delivery: typeof courierDeliveries.$inferSelect) => {
          const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId)).limit(1);
          const items = await loadItems(delivery.orderId);

          return {
            ...delivery,
            pickupLatitude: delivery.pickupLatitude ? String(delivery.pickupLatitude) : null,
            pickupLongitude: delivery.pickupLongitude ? String(delivery.pickupLongitude) : null,
            deliveryLatitude: delivery.deliveryLatitude ? String(delivery.deliveryLatitude) : null,
            deliveryLongitude: delivery.deliveryLongitude ? String(delivery.deliveryLongitude) : null,
            order: order
              ? {
                  id: order.id,
                  customerId: order.customerId,
                  customerName: order.customerName,
                  customerPhone: order.customerPhone,
                  customerAddress: order.customerAddress,
                  totalAmount: String(order.totalAmount),
                  status: order.status,
                  channel: order.channel,
                }
              : null,
            items,
          };
        }),
      );

      res.json(response);
    } catch (error) {
      console.error("Error fetching active deliveries:", error);
      res.status(500).json({ message: "Не удалось загрузить активные доставки" });
    }
  });

  app.get("/api/courier/deliveries", requireRole("courier"), async (req, res) => {
    try {
      const courierId = req.sessionUser!.id;
      const results = await db
        .select({
          delivery: courierDeliveries,
          order: orders,
        })
        .from(courierDeliveries)
        .innerJoin(orders, eq(courierDeliveries.orderId, orders.id))
        .where(eq(courierDeliveries.courierId, courierId))
        .orderBy(asc(courierDeliveries.deliverySequence), asc(courierDeliveries.createdAt));

      res.json(
        results.map((row) => ({
          ...row.delivery,
          order: {
            ...row.order,
            totalAmount: String(row.order.totalAmount),
          },
        })),
      );
    } catch (error) {
      console.error("Error fetching courier deliveries:", error);
      res.status(500).json({ message: "Не удалось загрузить доставки" });
    }
  });

  app.post("/api/courier/delivery/accept", requireRole("courier"), async (req, res) => {
    try {
      const courierId = req.sessionUser!.id;
      const { orderId } = acceptDeliverySchema.parse(req.body);

      const result = await db.transaction(async (tx) => {
        await resequenceCourierDeliveries(tx, courierId);
        const active = await getActiveCourierDeliveries(tx, courierId);

        if (active.length >= 3) {
          throw new Error("У курьера уже 3 активные доставки");
        }

        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);

        if (!order) {
          throw new Error("Заказ не найден");
        }

        if (order.courierId && order.courierId !== courierId) {
          throw new Error("Заказ уже назначен другому курьеру");
        }

        if (!["new", "delivery"].includes(order.status)) {
          throw new Error("Этот заказ нельзя взять в доставку");
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
          throw new Error("Заказ уже находится в активной доставке");
        }

        const sequence = active.length + 1;
        const [delivery] = await tx
          .insert(courierDeliveries)
          .values({
            courierId,
            orderId,
            deliverySequence: sequence,
            status: "pending",
            deliveryAddress: order.customerAddress,
          })
          .returning();

        await tx
          .update(orders)
          .set({
            courierId,
            status: "delivery",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));

        const event = await addOrderEvent(tx, {
          orderId,
          actorId: courierId,
          eventType: "courier_accepted",
          eventMessage: `Курьер принял заказ в доставку. Позиция маршрута: ${sequence}`,
          metadata: { deliveryId: delivery.id, deliverySequence: sequence },
        });

        return { delivery, event };
      });

      broadcastOrderEvent?.(orderId, result.event);
      res.status(201).json(result.delivery);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректные данные доставки");
      }

      if (error instanceof Error) {
        if (error.message.includes("не найден")) {
          return sendNotFound(res, error.message);
        }

        if (error.message.includes("3 активные") || error.message.includes("уже")) {
          return sendConflict(res, error.message);
        }

        return sendValidationError(res, error.message);
      }

      throw error;
    }
  });

  app.put("/api/courier/delivery/:id/sequence", requireRole("courier"), async (req, res) => {
    try {
      const courierId = req.sessionUser!.id;
      const deliveryId = Number(req.params.id);
      const { newSequence } = updateSequenceSchema.parse(req.body);

      if (Number.isNaN(deliveryId)) {
        return sendValidationError(res, "Некорректный идентификатор доставки", "id");
      }

      const updated = await db.transaction(async (tx) => {
        const active = await getActiveCourierDeliveries(tx, courierId);
        const current = active.find((delivery: typeof courierDeliveries.$inferSelect) => delivery.id === deliveryId);

        if (!current) {
          throw new Error("Доставка не найдена");
        }

        const updatedOrder = moveDeliveryToSequence(active, deliveryId, newSequence);
        await saveCourierDeliveryOrder(tx, updatedOrder);

        const [result] = await tx
          .select()
          .from(courierDeliveries)
          .where(eq(courierDeliveries.id, deliveryId))
          .limit(1);

        return result;
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректная позиция доставки");
      }

      if (error instanceof Error) {
        if (error.message.includes("не найдена")) {
          return sendNotFound(res, error.message);
        }

        return sendValidationError(res, error.message);
      }

      throw error;
    }
  });

  app.put("/api/courier/delivery/:id/status", requireRole("courier"), async (req, res) => {
    try {
      const courierId = req.sessionUser!.id;
      const deliveryId = Number(req.params.id);
      const input = updateStatusSchema.parse(req.body);

      if (Number.isNaN(deliveryId)) {
        return sendValidationError(res, "Некорректный идентификатор доставки", "id");
      }

      if (input.status === "cancelled" && !input.reasonKey) {
        return sendValidationError(res, "Выберите причину отмены", "reasonKey");
      }

      const result = await db.transaction(async (tx) => {
        const [delivery] = await tx
          .select()
          .from(courierDeliveries)
          .where(eq(courierDeliveries.id, deliveryId))
          .limit(1);

        if (!delivery || delivery.courierId !== courierId) {
          throw new Error("Доставка не найдена");
        }

        if (!isActiveDelivery(delivery.status)) {
          throw new Error("Можно менять только активную доставку");
        }

        if (input.status === "picked_up" && delivery.status !== "pending") {
          throw new Error("Заказ уже был взят курьером");
        }

        const updateData: Partial<typeof courierDeliveries.$inferInsert> = {
          status: input.status,
          updatedAt: new Date(),
        };

        if (input.status === "picked_up") {
          updateData.startedAt = new Date();
        }

        if (input.status === "delivered" || input.status === "cancelled") {
          updateData.completedAt = new Date();
        }

        const [updatedDelivery] = await tx
          .update(courierDeliveries)
          .set(updateData)
          .where(eq(courierDeliveries.id, deliveryId))
          .returning();

        let eventMessage = "Статус доставки обновлен";
        let orderStatus: "delivery" | "completed" | "cancelled" | "returning" = "delivery";

        if (input.status === "picked_up") {
          eventMessage = "Курьер забрал заказ";
        }

        if (input.status === "delivered") {
          eventMessage = "Заказ доставлен";
          orderStatus = "completed";

          const [order] = await tx
            .select({ status: orders.status })
            .from(orders)
            .where(eq(orders.id, delivery.orderId))
            .limit(1);

          if (order?.status === "returning") {
            orderStatus = "returning";
            eventMessage = "Заказ доставлен без возвращенного товара";
          }
        }

        if (input.status === "cancelled") {
          eventMessage = "Курьер отменил доставку";
          orderStatus = "cancelled";

          const [existingCancellation] = await tx
            .select()
            .from(orderCancellations)
            .where(eq(orderCancellations.orderId, delivery.orderId))
            .limit(1);

          if (!existingCancellation) {
            await tx.insert(orderCancellations).values({
              orderId: delivery.orderId,
              cancelledById: courierId,
              cancelledByRole: "courier",
              reasonKey: input.reasonKey || "other",
              reasonDetails: input.reasonDetails ?? null,
            });
          }

          const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, delivery.orderId));
          for (const item of items) {
            await tx
              .update(products)
              .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
              .where(eq(products.id, item.productId));
          }
        }

        await tx
          .update(orders)
          .set({ status: orderStatus, updatedAt: new Date() })
          .where(eq(orders.id, delivery.orderId));

        const event = await addOrderEvent(tx, {
          orderId: delivery.orderId,
          actorId: courierId,
          eventType: `delivery_${input.status}`,
          eventMessage,
          metadata: {
            deliveryId,
            status: input.status,
            reasonKey: input.reasonKey,
            reasonDetails: input.reasonDetails,
          },
        });

        if (input.status === "delivered" || input.status === "cancelled") {
          await resequenceCourierDeliveries(tx, courierId);
        }

        return { delivery: updatedDelivery, orderId: delivery.orderId, event };
      });

      broadcastOrderEvent?.(result.orderId, result.event);
      res.json(result.delivery);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Некорректный статус доставки");
      }

      if (error instanceof Error) {
        if (error.message.includes("не найдена")) {
          return sendNotFound(res, error.message);
        }

        return sendConflict(res, error.message);
      }

      throw error;
    }
  });

  app.delete("/api/courier/delivery/:id/items/:itemId", requireRole("courier"), async (req, res) => {
    try {
      const courierId = req.sessionUser!.id;
      const deliveryId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      const input = removeItemSchema.parse(req.body);

      if (Number.isNaN(deliveryId) || Number.isNaN(itemId)) {
        return sendValidationError(res, "Некорректный идентификатор позиции");
      }

      const result = await db.transaction(async (tx) => {
        const [delivery] = await tx
          .select()
          .from(courierDeliveries)
          .where(eq(courierDeliveries.id, deliveryId))
          .limit(1);

        if (!delivery || delivery.courierId !== courierId) {
          throw new Error("Доставка не найдена");
        }

        if (!isActiveDelivery(delivery.status)) {
          throw new Error("Можно изменять только активную доставку");
        }

        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, delivery.orderId));

        if (items.length <= 1) {
          throw new Error("Нельзя удалить последний товар. Отмените заказ целиком");
        }

        const item = items.find((orderItem: typeof orderItems.$inferSelect) => orderItem.id === itemId);

        if (!item) {
          throw new Error("Товар в заказе не найден");
        }

        const [removed] = await tx
          .insert(orderItemsRemoved)
          .values({
            orderId: delivery.orderId,
            orderItemId: item.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            removedById: courierId,
            removedByRole: "courier",
            reason: `${input.reasonKey}: ${input.reasonDetails}`,
          })
          .returning();

        await tx.delete(orderItems).where(eq(orderItems.id, item.id));

        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));

        const remainingTotal = items
          .filter((orderItem: typeof orderItems.$inferSelect) => orderItem.id !== item.id)
          .reduce((sum: number, orderItem: typeof orderItems.$inferSelect) => {
            return sum + Number(orderItem.price) * orderItem.quantity;
          }, 0);

        await tx
          .update(orders)
          .set({
            status: "returning",
            totalAmount: remainingTotal.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, delivery.orderId));

        const event = await addOrderEvent(tx, {
          orderId: delivery.orderId,
          actorId: courierId,
          eventType: "item_removed",
          eventMessage: "Курьер удалил товар из заказа",
          metadata: {
            deliveryId,
            itemId,
            productId: item.productId,
            quantity: item.quantity,
            reasonKey: input.reasonKey,
            reasonDetails: input.reasonDetails,
          },
        });

        return { removed, orderId: delivery.orderId, event };
      });

      broadcastOrderEvent?.(result.orderId, result.event);
      res.json({ success: true, removedRecord: result.removed });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendValidationError(res, "Укажите причину и комментарий по браку");
      }

      if (error instanceof Error) {
        if (error.message.includes("не найд")) {
          return sendNotFound(res, error.message);
        }

        return sendConflict(res, error.message);
      }

      throw error;
    }
  });
}
