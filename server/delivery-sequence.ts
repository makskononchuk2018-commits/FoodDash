import { courierDeliveries, type DeliveryStatus } from "@shared/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = ["pending", "picked_up"];

type DeliveryRow = typeof courierDeliveries.$inferSelect;

type DeliveryOrderUpdate = {
  id: number;
  sequence: number;
  status: DeliveryStatus;
};

export async function getActiveCourierDeliveries(executor: any, courierId: number) {
  return executor
    .select()
    .from(courierDeliveries)
    .where(
      and(
        eq(courierDeliveries.courierId, courierId),
        inArray(courierDeliveries.status, ACTIVE_DELIVERY_STATUSES),
      ),
    )
    .orderBy(asc(courierDeliveries.deliverySequence), asc(courierDeliveries.createdAt));
}

async function persistDeliveryOrder(executor: any, updates: DeliveryOrderUpdate[]) {
  if (updates.length === 0) {
    return;
  }

  const idsSql = sql.join(updates.map((update) => sql`${update.id}`), sql`, `);
  const sequenceCaseSql = sql.join(
    updates.map((update) => sql`WHEN ${update.id} THEN ${update.sequence}`),
    sql` `,
  );
  const statusCaseSql = sql.join(
    updates.map((update) => sql`WHEN ${update.id} THEN ${update.status}`),
    sql` `,
  );

  await executor.execute(sql`
    UPDATE courier_deliveries
    SET status = 'cancelled'
    WHERE id IN (${idsSql})
  `);

  await executor.execute(sql`
    UPDATE courier_deliveries
    SET delivery_sequence = CASE id ${sequenceCaseSql} ELSE delivery_sequence END,
        status = CASE id ${statusCaseSql} ELSE status END,
        updated_at = NOW()
    WHERE id IN (${idsSql})
  `);
}

export async function saveCourierDeliveryOrder(executor: any, orderedDeliveries: DeliveryRow[]) {
  const updates = orderedDeliveries
    .map((delivery, index) => ({
      id: delivery.id,
      sequence: index + 1,
      status: delivery.status,
      currentSequence: delivery.deliverySequence,
    }))
    .filter((update) => update.currentSequence !== update.sequence)
    .map(({ currentSequence: _currentSequence, ...update }) => update);

  await persistDeliveryOrder(executor, updates);
}

export async function resequenceCourierDeliveries(executor: any, courierId: number) {
  const active = await getActiveCourierDeliveries(executor, courierId);
  await saveCourierDeliveryOrder(executor, active);
  return getActiveCourierDeliveries(executor, courierId);
}

export function moveDeliveryToSequence(activeDeliveries: DeliveryRow[], deliveryId: number, newSequence: number) {
  const current = activeDeliveries.find((delivery) => delivery.id === deliveryId);

  if (!current) {
    return activeDeliveries;
  }

  const targetPosition = Math.min(Math.max(newSequence, 1), activeDeliveries.length);
  const nextOrder = activeDeliveries.filter((delivery) => delivery.id !== deliveryId);
  nextOrder.splice(targetPosition - 1, 0, current);

  return nextOrder;
}
