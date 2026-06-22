import { db } from "./db";
import {
  users,
  products,
  orders,
  orderItems,
  orderEvents,
  savedAddresses,
  managerContacts,
  bonusTransactions,
  type Product,
  type InsertProduct,
  type UpdateProductRequest,
  type Order,
  type OrderWithItems,
  type CreateOrderRequest,
  type AnalyticsSummary,
  type User,
  type InsertUser,
  type AdminUserListItem,
  type OrderEvent,
  type ManagerContact,
  type BonusTransaction,
  type CourierStats,
  type UserRole,
  type OrderStatus,
  type CustomerOrderHistoryItem,
  ORDER_STATUSES,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

export type UserUpdatePayload = {
  username?: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  role?: UserRole;
  password?: string;
};

export type UserListFilters = {
  role?: UserRole;
  status?: "active" | "deleted" | "all";
  search?: string;
};

export type OrderMutationActor = {
  id: number;
  role: UserRole | "system";
};

export type OrderMutationResult = {
  order: OrderWithItems;
  event: OrderEvent;
  bonusSpent?: number;
  bonusEarned?: number;
};

export class DatabaseStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db
      .insert(users)
      .values({
        ...user,
        role: user.role as UserRole | undefined,
      })
      .returning();
    return newUser;
  }

  async listUsers(filters: UserListFilters = {}): Promise<AdminUserListItem[]> {
    const clauses = [] as ReturnType<typeof eq>[];

    if (filters.role) {
      clauses.push(eq(users.role, filters.role));
    }

    if (filters.status === "active") {
      clauses.push(eq(users.isDeleted, false));
    }

    if (filters.status === "deleted") {
      clauses.push(eq(users.isDeleted, true));
    }

    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      const rows = await db.execute(sql`
        SELECT
          id,
          username,
          role,
          full_name as "fullName",
          email,
          phone,
          bonus_balance as "bonusBalance",
          is_deleted as "isDeleted",
          deleted_at as "deletedAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM users
        WHERE (
          username ILIKE ${search}
          OR full_name ILIKE ${search}
          OR COALESCE(email, '') ILIKE ${search}
          OR COALESCE(phone, '') ILIKE ${search}
        )
        ${filters.role ? sql`AND role = ${filters.role}` : sql``}
        ${filters.status === "active" ? sql`AND is_deleted = false` : sql``}
        ${filters.status === "deleted" ? sql`AND is_deleted = true` : sql``}
        ORDER BY created_at DESC
      `);

      return rows.rows as unknown as AdminUserListItem[];
    }

    const data = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        bonusBalance: users.bonusBalance,
        isDeleted: users.isDeleted,
        deletedAt: users.deletedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(desc(users.createdAt));

    return data;
  }

  async updateUser(id: number, updates: UserUpdatePayload): Promise<User | undefined> {
    const payload: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.username !== undefined) payload.username = updates.username;
    if (updates.fullName !== undefined) payload.fullName = updates.fullName;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.password !== undefined) payload.password = updates.password;

    const [updated] = await db.update(users).set(payload).where(eq(users.id, id)).returning();
    return updated;
  }

  async softDeleteUser(id: number): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return updated;
  }

  async restoreUser(id: number): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return updated;
  }

  // Manager contact
  async getActiveManagerContact(): Promise<ManagerContact | undefined> {
    const [contact] = await db
      .select()
      .from(managerContacts)
      .where(eq(managerContacts.isActive, true))
      .orderBy(desc(managerContacts.updatedAt))
      .limit(1);

    return contact;
  }

  async upsertManagerContact(input: {
    label: string;
    telegramUrl: string;
    telegramUsername?: string | null;
    updatedBy?: number;
  }): Promise<ManagerContact> {
    const active = await this.getActiveManagerContact();

    if (active) {
      const [updated] = await db
        .update(managerContacts)
        .set({
          label: input.label,
          telegramUrl: input.telegramUrl,
          telegramUsername: input.telegramUsername ?? null,
          updatedBy: input.updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(managerContacts.id, active.id))
        .returning();

      return updated;
    }

    const [created] = await db
      .insert(managerContacts)
      .values({
        label: input.label,
        telegramUrl: input.telegramUrl,
        telegramUsername: input.telegramUsername ?? null,
        updatedBy: input.updatedBy,
        isActive: true,
      })
      .returning();

    return created;
  }

  // Products
  async getProducts(): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .where(eq(products.isDeleted, false))
      .orderBy(desc(products.id));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isDeleted, false)));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, updates: UpdateProductRequest): Promise<Product | undefined> {
    const [updated] = await db
      .update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.isDeleted, false)))
      .returning();

    return updated;
  }

  async deleteProduct(id: number): Promise<void> {
    await db
      .update(products)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(products.id, id));
  }

  // Orders and events
  private groupOrderRows(
    rows: {
      order: Order;
      item: typeof orderItems.$inferSelect | null;
      product: Product | null;
    }[],
  ): OrderWithItems[] {
    const map = new Map<number, OrderWithItems>();

    for (const row of rows) {
      if (!map.has(row.order.id)) {
        map.set(row.order.id, { ...row.order, items: [] });
      }

      if (row.item && row.product) {
        map.get(row.order.id)!.items.push({ ...row.item, product: row.product });
      }
    }

    return Array.from(map.values());
  }

  private async loadOrders(condition?: ReturnType<typeof and>, executor: any = db): Promise<OrderWithItems[]> {
    const rows = await executor
      .select({
        order: orders,
        item: orderItems,
        product: products,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(condition)
      .orderBy(desc(orders.createdAt), asc(orderItems.id));

    return this.groupOrderRows(rows);
  }

  async getOrders(): Promise<OrderWithItems[]> {
    return this.loadOrders();
  }

  async getOrder(id: number): Promise<OrderWithItems | undefined> {
    const [order] = await this.loadOrders(and(eq(orders.id, id)));
    return order;
  }

  async getCustomerOrders(customerId: number): Promise<CustomerOrderHistoryItem[]> {
    const customerOrders = await this.loadOrders(and(eq(orders.customerId, customerId), eq(orders.isDeletedByCustomer, false)));

    if (!customerOrders.length) {
      return [];
    }

    const ids = customerOrders.map((order) => order.id);
    const events = await db
      .select()
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, ids))
      .orderBy(desc(orderEvents.createdAt));

    const eventsByOrder = new Map<number, OrderEvent>();
    for (const event of events) {
      if (!eventsByOrder.has(event.orderId)) {
        eventsByOrder.set(event.orderId, event);
      }
    }

    return customerOrders.map((order) => ({
      ...order,
      lastEvent: eventsByOrder.get(order.id),
    }));
  }

  async getOrdersByCourier(courierId: number): Promise<OrderWithItems[]> {
    return this.loadOrders(and(eq(orders.courierId, courierId)));
  }

  async getAvailableCourierOrders(): Promise<OrderWithItems[]> {
    return this.loadOrders(
      and(eq(orders.status, "new"), isNull(orders.courierId)),
    );
  }

  async getActiveCourierOrders(courierId: number): Promise<OrderWithItems[]> {
    return this.loadOrders(
      and(eq(orders.courierId, courierId), inArray(orders.status, ["delivery", "returning"])),
    );
  }

  async getCustomerSavedAddresses(customerId: number): Promise<typeof savedAddresses.$inferSelect[]> {
    return db
      .select()
      .from(savedAddresses)
      .where(eq(savedAddresses.customerId, customerId))
      .orderBy(desc(savedAddresses.isDefault), desc(savedAddresses.createdAt));
  }

  private statusMessage(status: OrderStatus): string {
    switch (status) {
      case "new":
        return "Заказ создан";
      case "delivery":
        return "Курьер в пути";
      case "completed":
        return "Заказ доставлен";
      case "cancelled":
        return "Заказ отменен";
      case "returning":
        return "Возврат заказа";
      default:
        return "Статус заказа обновлен";
    }
  }

  async createOrder(customerId: number, req: CreateOrderRequest): Promise<OrderMutationResult> {
    return db.transaction(async (tx) => {
      const uniqueProductIds = Array.from(new Set(req.items.map((item) => item.productId)));
      const dbProducts = await tx
        .select()
        .from(products)
        .where(and(inArray(products.id, uniqueProductIds), eq(products.isDeleted, false)));

      if (dbProducts.length !== uniqueProductIds.length) {
        throw new Error("Некоторые товары не найдены");
      }

      const productById = new Map(dbProducts.map((product) => [product.id, product]));
      const quantityByProduct = new Map<number, number>();
      let totalAmount = 0;

      for (const item of req.items) {
        const product = productById.get(item.productId);

        if (!product) {
          throw new Error(`Товар #${item.productId} не найден`);
        }

        if (item.quantity <= 0) {
          throw new Error("Количество товара должно быть больше нуля");
        }

        const prevQty = quantityByProduct.get(item.productId) || 0;
        quantityByProduct.set(item.productId, prevQty + item.quantity);

        totalAmount += Number(product.price) * item.quantity;
      }

      for (const [productId, qty] of Array.from(quantityByProduct.entries())) {
        const product = productById.get(productId)!;

        if (product.stock < qty) {
          throw new Error(`Недостаточно товара "${product.name}" на складе`);
        }
      }

      const [createdOrder] = await tx
        .insert(orders)
        .values({
          customerId,
          customerName: req.customerName,
          customerPhone: req.customerPhone,
          customerAddress: req.customerAddress,
          totalAmount: totalAmount.toFixed(2),
          channel: req.channel ?? "website",
          status: "new",
        })
        .returning();

      await tx.insert(orderItems).values(
        req.items.map((item) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          price: productById.get(item.productId)!.price,
        })),
      );

      for (const [productId, qty] of Array.from(quantityByProduct.entries())) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${qty}`, updatedAt: new Date() })
          .where(eq(products.id, productId));
      }

      const [existingAddress] = await tx
        .select({ id: savedAddresses.id })
        .from(savedAddresses)
        .where(and(eq(savedAddresses.customerId, customerId), eq(savedAddresses.address, req.customerAddress)))
        .limit(1);

      if (!existingAddress) {
        const [hasAddress] = await tx
          .select({ id: savedAddresses.id })
          .from(savedAddresses)
          .where(eq(savedAddresses.customerId, customerId))
          .limit(1);

        await tx.insert(savedAddresses).values({
          customerId,
          address: req.customerAddress,
          isDefault: !hasAddress,
        });
      }

      // Handle bonus spending if requested
      let bonusDeducted = 0;
      let bonusEarned = 0;
      if (req.useBonuses) {
        const [user] = await tx.select({ bonusBalance: users.bonusBalance }).from(users).where(eq(users.id, customerId));
        const currentBonus = user ? Number(user.bonusBalance) : 0;
        
        // Deduct bonuses, limited to 30% of the order (matching frontend logic)
        const maxBonusDeduction = Math.floor(totalAmount * 0.3);
        bonusDeducted = Math.min(currentBonus, maxBonusDeduction);
        
        if (bonusDeducted > 0) {
          // Update user bonus balance after deduction
          await tx
            .update(users)
            .set({ bonusBalance: (currentBonus - bonusDeducted).toFixed(2), updatedAt: new Date() })
            .where(eq(users.id, customerId));
          
          // Record bonus spend transaction
          await tx.insert(bonusTransactions).values({
            userId: customerId,
            type: "spend",
            amount: bonusDeducted.toFixed(2),
            description: `Бонусы потрачены на заказ #${createdOrder.id}`,
            orderId: createdOrder.id,
          });
        }
      }

      if (bonusDeducted <= 0) {
        // Add 2% bonus only when the customer did not pay with bonuses.
        const bonusAmount = (totalAmount * 0.02).toFixed(2);
        bonusEarned = Number(bonusAmount);

        const [userAfterDeduction] = await tx.select({ bonusBalance: users.bonusBalance }).from(users).where(eq(users.id, customerId));
        const currentBonusAfterDeduction = userAfterDeduction ? Number(userAfterDeduction.bonusBalance) : 0;

        await tx
          .update(users)
          .set({ bonusBalance: (currentBonusAfterDeduction + Number(bonusAmount)).toFixed(2), updatedAt: new Date() })
          .where(eq(users.id, customerId));

        await tx.insert(bonusTransactions).values({
          userId: customerId,
          type: "earn",
          amount: bonusAmount,
          description: `Бонусы за заказ (2% от ${totalAmount.toFixed(2)})`,
          orderId: createdOrder.id,
        });
      }

      const [event] = await tx
        .insert(orderEvents)
        .values({
          orderId: createdOrder.id,
          actorId: customerId,
          actorRole: "customer",
          eventType: "created",
          eventMessage: "Заказ создан клиентом",
          metadata: {},
        })
        .returning();

      const [order] = await this.loadOrders(and(eq(orders.id, createdOrder.id)), tx);

      if (!order) {
        throw new Error("Не удалось сформировать заказ");
      }

      return { order, event, bonusSpent: bonusDeducted, bonusEarned };
    });
  }

  async repeatOrder(customerId: number, sourceOrderId: number): Promise<OrderMutationResult> {
    const [sourceOrder] = await this.loadOrders(and(eq(orders.id, sourceOrderId), eq(orders.customerId, customerId)));

    if (!sourceOrder) {
      throw new Error("Исходный заказ не найден");
    }

    return this.createOrder(customerId, {
      customerName: sourceOrder.customerName,
      customerPhone: sourceOrder.customerPhone,
      customerAddress: sourceOrder.customerAddress,
      channel: "website",
      items: sourceOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
  }

  async acceptCourierOrder(orderId: number, courierId: number): Promise<OrderMutationResult> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(orders).where(eq(orders.id, orderId));

      if (!existing) {
        throw new Error("Заказ не найден");
      }

      if (existing.courierId && existing.courierId !== courierId) {
        throw new Error("Заказ уже принят другим курьером");
      }

      if (existing.status !== "new") {
        throw new Error("Нельзя принять заказ в текущем статусе");
      }

      await tx
        .update(orders)
        .set({
          courierId,
          status: "delivery",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      const [event] = await tx
        .insert(orderEvents)
        .values({
          orderId,
          actorId: courierId,
          actorRole: "courier",
          eventType: "courier_accepted",
          eventMessage: "Курьер принял заказ",
          metadata: {},
        })
        .returning();

      const [order] = await this.loadOrders(and(eq(orders.id, orderId)), tx);

      if (!order) {
        throw new Error("Не удалось получить обновленный заказ");
      }

      return { order, event };
    });
  }

  async updateOrderStatus(orderId: number, status: OrderStatus, actor: OrderMutationActor): Promise<OrderMutationResult> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(orders).where(eq(orders.id, orderId));

      if (!existing) {
        throw new Error("Заказ не найден");
      }

      const nextStatus = status === "completed" && existing.status === "returning" ? "returning" : status;

      if (nextStatus === "cancelled" && existing.status !== "cancelled") {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }
      }

      const updatePayload: Partial<typeof orders.$inferInsert> = {
        status: nextStatus,
        updatedAt: new Date(),
      };

      if (actor.role === "courier" && !existing.courierId) {
        updatePayload.courierId = actor.id;
      }

      await tx.update(orders).set(updatePayload).where(eq(orders.id, orderId));

      const [event] = await tx
        .insert(orderEvents)
        .values({
          orderId,
          actorId: actor.id,
          actorRole: actor.role,
          eventType: `status_${nextStatus}`,
          eventMessage: this.statusMessage(nextStatus),
          metadata: { status: nextStatus, requestedStatus: status },
        })
        .returning();

      const [order] = await this.loadOrders(and(eq(orders.id, orderId)), tx);

      if (!order) {
        throw new Error("Не удалось получить обновленный заказ");
      }

      return { order, event };
    });
  }

  async getOrderTimeline(orderId: number): Promise<OrderEvent[]> {
    return db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(asc(orderEvents.createdAt));
  }

  async deleteOrderByCustomer(orderId: number, customerId: number): Promise<void> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

    if (!order) {
      throw new Error("Заказ не найден");
    }

    if (order.customerId !== customerId) {
      throw new Error("Вы можете удалить только свои заказы");
    }

    if (order.status !== "completed") {
      throw new Error("Можно удалять только доставленные заказы");
    }

    // Soft delete - just mark as deleted by customer, don't actually delete
    await db
      .update(orders)
      .set({
        isDeletedByCustomer: true,
        deletedByCustomerAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  }

  async getCourierStats(courierId: number, period: "day" | "week" | "month"): Promise<CourierStats> {
    const now = new Date();
    const from = new Date(now);

    if (period === "day") {
      from.setDate(from.getDate() - 1);
    } else if (period === "week") {
      from.setDate(from.getDate() - 7);
    } else {
      from.setMonth(from.getMonth() - 1);
    }

    const [row] = await db
      .select({
        completed: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
        active: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'delivery' THEN 1 ELSE 0 END), 0)::int`,
        cancelled: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} IN ('cancelled', 'returning') THEN 1 ELSE 0 END), 0)::int`,
        assigned: sql<number>`COUNT(*)::int`,
        avgMinutes: sql<number>`COALESCE(AVG(CASE WHEN ${orders.status} = 'completed' THEN EXTRACT(EPOCH FROM (${orders.updatedAt} - ${orders.createdAt})) / 60 END), 0)::float`,
      })
      .from(orders)
.where(and(eq(orders.courierId, courierId), sql`${orders.updatedAt} >= ${from}`));

    const completedDeliveries = Number(row?.completed || 0);
    const activeDeliveries = Number(row?.active || 0);
    const cancelledDeliveries = Number(row?.cancelled || 0);
    const assigned = Number(row?.assigned || 0);
    const averageDeliveryMinutes = Number(row?.avgMinutes || 0);
    const successRate = assigned > 0 ? (completedDeliveries / assigned) * 100 : 0;

    return {
      period,
      completedDeliveries,
      activeDeliveries,
      cancelledDeliveries,
      successRate,
      averageDeliveryMinutes,
    };
  }

  // Analytics
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const [totals] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'completed' THEN ${orders.totalAmount}::numeric ELSE 0 END), 0)::float`,
        totalOrders: sql<number>`COUNT(*)::int`,
        completedOrders: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
        activeOrders: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} IN ('new', 'delivery') THEN 1 ELSE 0 END), 0)::int`,
        cancelledOrders: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'cancelled' THEN 1 ELSE 0 END), 0)::int`,
        returningOrders: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'returning' THEN 1 ELSE 0 END), 0)::int`,
        averageOrderValue: sql<number>`COALESCE(AVG(CASE WHEN ${orders.status} = 'completed' THEN ${orders.totalAmount}::numeric END), 0)::float`,
      })
      .from(orders);

    const [customerTotals] = await db
      .select({
        totalCustomers: sql<number>`COUNT(*)::int`,
      })
      .from(users)
      .where(and(eq(users.role, "customer"), eq(users.isDeleted, false)));

    const [productTotals] = await db
      .select({
        totalProducts: sql<number>`COUNT(*)::int`,
        lowStockProducts: sql<number>`COALESCE(SUM(CASE WHEN ${products.stock} <= 10 THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(products)
      .where(eq(products.isDeleted, false));

    const [itemTotals] = await db
      .select({
        totalItemsSold: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(and(eq(orders.status, "completed"), eq(products.isDeleted, false)));

    const channelRows = await db
      .select({
        channel: orders.channel,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(orders)
      .groupBy(orders.channel);

    const statusRows = await db
      .select({
        status: orders.status,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(orders)
      .groupBy(orders.status);

    const productRows = await db
      .select({
        name: products.name,
        quantity: sql<number>`SUM(${orderItems.quantity})::int`,
        revenue: sql<number>`SUM(${orderItems.price}::numeric * ${orderItems.quantity})::float`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(and(eq(orders.status, "completed"), eq(products.isDeleted, false)))
      .groupBy(products.id, products.name)
      .orderBy(desc(sql`SUM(${orderItems.price}::numeric * ${orderItems.quantity})`))
      .limit(10);

    const categoryRows = await db
      .select({
        category: products.category,
        products: sql<number>`COUNT(*)::int`,
        stock: sql<number>`COALESCE(SUM(${products.stock}), 0)::int`,
        stockValue: sql<number>`COALESCE(SUM(${products.price}::numeric * ${products.stock}), 0)::float`,
      })
      .from(products)
      .where(eq(products.isDeleted, false))
      .groupBy(products.category)
      .orderBy(asc(products.category));

    const recentOrderRows = await db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        customerName: orders.customerName,
        status: orders.status,
        courierName: users.fullName,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .leftJoin(users, eq(orders.courierId, users.id))
      .orderBy(desc(orders.createdAt))
      .limit(15);

    const salesRows = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', ${orders.createdAt}), 'YYYY-MM-DD') AS date,
        COALESCE(SUM(CASE WHEN ${orders.status} = 'completed' THEN ${orders.totalAmount}::numeric ELSE 0 END), 0)::float AS amount,
        COUNT(*)::int AS orders
      FROM ${orders}
      GROUP BY DATE_TRUNC('day', ${orders.createdAt})
      ORDER BY DATE_TRUNC('day', ${orders.createdAt}) ASC
    `);

    const ordersByChannel: Record<string, number> = {};
    for (const row of channelRows) {
      ordersByChannel[row.channel] = Number(row.total);
    }

    const ordersByStatus: Record<string, number> = {};
    for (const row of statusRows) {
      ordersByStatus[row.status] = Number(row.total);
    }

    return {
      totalRevenue: Number(totals?.totalRevenue || 0),
      totalOrders: Number(totals?.totalOrders || 0),
      completedOrders: Number(totals?.completedOrders || 0),
      activeOrders: Number(totals?.activeOrders || 0),
      cancelledOrders: Number(totals?.cancelledOrders || 0),
      returningOrders: Number(totals?.returningOrders || 0),
      averageOrderValue: Number(totals?.averageOrderValue || 0),
      ordersByChannel,
      ordersByStatus,
      totalCustomers: Number(customerTotals?.totalCustomers || 0),
      totalProducts: Number(productTotals?.totalProducts || 0),
      lowStockProducts: Number(productTotals?.lowStockProducts || 0),
      totalItemsSold: Number(itemTotals?.totalItemsSold || 0),
      topProducts: productRows.map((item) => ({
        name: item.name,
        quantity: Number(item.quantity),
        revenue: Number(item.revenue),
      })),
      salesByDate: (salesRows.rows as { date: string; amount: number; orders: number }[]).map((row) => ({
        date: row.date,
        amount: Number(row.amount),
        orders: Number(row.orders),
      })),
      productCategories: categoryRows.map((item) => ({
        category: item.category,
        products: Number(item.products),
        stock: Number(item.stock),
        stockValue: Number(item.stockValue),
      })),
      recentOrders: recentOrderRows.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        customerName: order.customerName,
        status: order.status,
        courierName: order.courierName,
        totalAmount: Number(order.totalAmount),
      })),
    };
  }

  // Bonus methods
  async getBonusBalance(userId: number): Promise<number> {
    const [user] = await db.select({ bonusBalance: users.bonusBalance }).from(users).where(eq(users.id, userId));
    return user ? Number(user.bonusBalance) : 0;
  }

  async addBonusTransaction(
    userId: number,
    type: "earn" | "spend",
    amount: string | number,
    description: string,
    orderId?: number,
  ): Promise<BonusTransaction> {
    return db.transaction(async (tx) => {
      const amountNum = Number(amount);

      // Get current balance
      const [user] = await tx.select({ bonusBalance: users.bonusBalance }).from(users).where(eq(users.id, userId));
      const currentBalance = user ? Number(user.bonusBalance) : 0;

      // For spend, check that balance is sufficient
      if (type === "spend" && currentBalance < amountNum) {
        throw new Error("Недостаточно бонусов для списания");
      }

      // Update user balance
      const newBalance = type === "earn" ? currentBalance + amountNum : currentBalance - amountNum;
      await tx
        .update(users)
        .set({ bonusBalance: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Record transaction
      const [transaction] = await tx
        .insert(bonusTransactions)
        .values({
          userId,
          type,
          amount: amountNum.toFixed(2),
          description,
          orderId: orderId || null,
        })
        .returning();

      return transaction;
    });
  }

  async getBonusTransactions(userId: number, limit: number = 50): Promise<BonusTransaction[]> {
    return db
      .select()
      .from(bonusTransactions)
      .where(eq(bonusTransactions.userId, userId))
      .orderBy(desc(bonusTransactions.createdAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
