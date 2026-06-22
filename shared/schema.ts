import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const USER_ROLES = ["customer", "admin", "courier"] as const;
export const ORDER_STATUSES = ["new", "delivery", "completed", "cancelled", "returning"] as const;
export const ORDER_CHANNELS = ["website", "wildberries", "ozon", "yandex"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    role: text("role").$type<UserRole>().notNull().default("customer"),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    bonusBalance: numeric("bonus_balance", { precision: 12, scale: 2 }).notNull().default("0"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    usersRoleIdx: index("idx_users_role").on(table.role),
    usersDeletedIdx: index("idx_users_deleted").on(table.isDeleted),
  }),
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    stock: integer("stock").notNull().default(0),
    category: text("category").notNull(),
    imageUrl: text("image_url").notNull(),
    marketplaceStatus: jsonb("marketplace_status")
      .$type<{
        wildberries?: { synced: boolean; lastSync: string; externalId?: string };
        ozon?: { synced: boolean; lastSync: string; externalId?: string };
        yandex?: { synced: boolean; lastSync: string; externalId?: string };
      }>()
      .notNull()
      .default({}),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    productsCategoryIdx: index("idx_products_category").on(table.category),
    productsDeletedIdx: index("idx_products_deleted").on(table.isDeleted),
    productsStockCheck: check("products_stock_non_negative", sql`${table.stock} >= 0`),
    productsPriceCheck: check("products_price_non_negative", sql`${table.price} >= 0`),
  }),
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    courierId: integer("courier_id").references(() => users.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerAddress: text("customer_address").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("new"),
    channel: text("channel").$type<OrderChannel>().notNull().default("website"),
    isDeletedByCustomer: boolean("is_deleted_by_customer").notNull().default(false),
    deletedByCustomerAt: timestamp("deleted_by_customer_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    ordersCustomerIdx: index("idx_orders_customer_id").on(table.customerId),
    ordersCourierIdx: index("idx_orders_courier_id").on(table.courierId),
    ordersStatusIdx: index("idx_orders_status").on(table.status),
    ordersCreatedAtIdx: index("idx_orders_created_at").on(table.createdAt),
    ordersChannelIdx: index("idx_orders_channel").on(table.channel),
    ordersDeletedByCustomerIdx: index("idx_orders_deleted_by_customer").on(table.isDeletedByCustomer),
    ordersAmountCheck: check("orders_total_amount_non_negative", sql`${table.totalAmount} >= 0`),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderItemsOrderIdx: index("idx_order_items_order_id").on(table.orderId),
    orderItemsProductIdx: index("idx_order_items_product_id").on(table.productId),
    orderItemsQtyCheck: check("order_items_qty_positive", sql`${table.quantity} > 0`),
    orderItemsPriceCheck: check("order_items_price_non_negative", sql`${table.price} >= 0`),
  }),
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role").$type<UserRole | "system">().notNull().default("system"),
    eventType: text("event_type").notNull(),
    eventMessage: text("event_message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderEventsOrderIdx: index("idx_order_events_order_id").on(table.orderId),
    orderEventsCreatedIdx: index("idx_order_events_created_at").on(table.createdAt),
    orderEventsTypeIdx: index("idx_order_events_type").on(table.eventType),
  }),
);

export const courierSchedule = pgTable(
  "courier_schedule",
  {
    id: serial("id").primaryKey(),
    courierId: integer("courier_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week").notNull(),
    timeSlots: text("time_slots").array().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    courierScheduleCourierIdx: index("idx_courier_schedule_courier_id").on(table.courierId),
    courierScheduleUnique: uniqueIndex("uq_courier_schedule_day").on(table.courierId, table.dayOfWeek),
  }),
);

export const shoppingCarts = pgTable(
  "shopping_carts",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    shoppingCartsCustomerIdx: index("idx_shopping_carts_customer_id").on(table.customerId),
  }),
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: integer("cart_id")
      .notNull()
      .references(() => shoppingCarts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    cartItemsCartIdx: index("idx_cart_items_cart_id").on(table.cartId),
    cartItemsQtyCheck: check("cart_items_qty_positive", sql`${table.quantity} > 0`),
  }),
);

export const savedAddresses = pgTable(
  "saved_addresses",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    savedAddressesCustomerIdx: index("idx_saved_addresses_customer_id").on(table.customerId),
    savedAddressesUnique: uniqueIndex("uq_saved_addresses_customer_address").on(table.customerId, table.address),
  }),
);

export const managerContacts = pgTable(
  "manager_contacts",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull().default("Связь с менеджером"),
    telegramUrl: text("telegram_url").notNull(),
    telegramUsername: text("telegram_username"),
    isActive: boolean("is_active").notNull().default(true),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    managerContactsActiveIdx: index("idx_manager_contacts_active").on(table.isActive),
  }),
);

export const bonusTransactions = pgTable(
  "bonus_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    type: text("type").$type<"earn" | "spend">().notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    bonusTransactionsUserIdx: index("idx_bonus_transactions_user_id").on(table.userId),
    bonusTransactionsOrderIdx: index("idx_bonus_transactions_order_id").on(table.orderId),
    bonusTransactionsTypeIdx: index("idx_bonus_transactions_type").on(table.type),
  }),
);

export const courierLocations = pgTable(
  "courier_locations",
  {
    id: serial("id").primaryKey(),
    courierId: integer("courier_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    accuracy: numeric("accuracy", { precision: 8, scale: 2 }),
    speed: numeric("speed", { precision: 8, scale: 2 }),
    heading: numeric("heading", { precision: 8, scale: 2 }),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    courierLocationsIdx: index("idx_courier_locations_courier_id").on(table.courierId),
    courierLocationsOrderIdx: index("idx_courier_locations_order_id").on(table.orderId),
    courierLocationsCreatedIdx: index("idx_courier_locations_created_at").on(table.createdAt),
  }),
);

export const DELIVERY_STATUSES = ["pending", "picked_up", "delivered", "cancelled"] as const;
export const CANCELLATION_ROLES = ["customer", "courier", "admin"] as const;
export const COURIER_APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type CancellationRole = (typeof CANCELLATION_ROLES)[number];
export type CourierApplicationStatus = (typeof COURIER_APPLICATION_STATUSES)[number];

export const deliveryReasons = pgTable(
  "delivery_reasons",
  {
    id: serial("id").primaryKey(),
    role: text("role").$type<CancellationRole>().notNull(),
    reasonKey: text("reason_key").notNull(),
    reasonText: text("reason_text").notNull(),
    category: text("category").notNull().default("other"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    deliveryReasonsRoleIdx: index("idx_delivery_reasons_role").on(table.role),
  }),
);

export const courierDeliveries = pgTable(
  "courier_deliveries",
  {
    id: serial("id").primaryKey(),
    courierId: integer("courier_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    deliverySequence: integer("delivery_sequence").notNull(),
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    pickupLatitude: numeric("pickup_latitude", { precision: 10, scale: 7 }),
    pickupLongitude: numeric("pickup_longitude", { precision: 10, scale: 7 }),
    deliveryAddress: text("delivery_address").notNull(),
    deliveryLatitude: numeric("delivery_latitude", { precision: 10, scale: 7 }),
    deliveryLongitude: numeric("delivery_longitude", { precision: 10, scale: 7 }),
    notes: text("notes"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    courierDeliveriesCourierIdx: index("idx_courier_deliveries_courier_id").on(table.courierId),
    courierDeliveriesOrderIdx: index("idx_courier_deliveries_order_id").on(table.orderId),
    courierDeliveriesStatusIdx: index("idx_courier_deliveries_status").on(table.status),
    courierDeliveriesSequenceIdx: index("idx_courier_deliveries_sequence").on(table.deliverySequence),
    courierDeliveriesUnique: uniqueIndex("uq_courier_deliveries_courier_order").on(
      table.courierId,
      table.orderId,
    ),
    courierDeliveriesSequenceCheck: check(
      "courier_deliveries_sequence_check",
      sql`${table.deliverySequence} BETWEEN 1 AND 3`,
    ),
  }),
);

export const orderCancellations = pgTable(
  "order_cancellations",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    cancelledById: integer("cancelled_by_id").references(() => users.id, { onDelete: "set null" }),
    cancelledByRole: text("cancelled_by_role").$type<CancellationRole>().notNull(),
    reasonKey: text("reason_key").notNull(),
    reasonDetails: text("reason_details"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderCancellationsOrderIdx: index("idx_order_cancellations_order_id").on(table.orderId),
    orderCancellationsCreatedIdx: index("idx_order_cancellations_created_at").on(table.createdAt),
    orderCancellationsUnique: uniqueIndex("uq_order_cancellations_order").on(table.orderId),
  }),
);

export const orderItemsRemoved = pgTable(
  "order_items_removed",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    removedById: integer("removed_by_id").references(() => users.id, { onDelete: "set null" }),
    removedByRole: text("removed_by_role").$type<CancellationRole>().notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderItemsRemovedOrderIdx: index("idx_order_items_removed_order_id").on(table.orderId),
    orderItemsRemovedRemovedByIdx: index("idx_order_items_removed_removed_by").on(table.removedById),
  }),
);

export const courierApplications = pgTable(
  "courier_applications",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    experience: text("experience"),
    comment: text("comment"),
    status: text("status").$type<CourierApplicationStatus>().notNull().default("pending"),
    adminComment: text("admin_comment"),
    reviewedById: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    courierApplicationsStatusIdx: index("idx_courier_applications_status").on(table.status),
    courierApplicationsCreatedIdx: index("idx_courier_applications_created_at").on(table.createdAt),
  }),
);

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
  deletedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true });
export const insertOrderEventSchema = createInsertSchema(orderEvents).omit({ id: true, createdAt: true });
export const insertCourierScheduleSchema = createInsertSchema(courierSchedule).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCourierLocationSchema = createInsertSchema(courierLocations).omit({ id: true, createdAt: true });
export const insertShoppingCartSchema = createInsertSchema(shoppingCarts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, createdAt: true });
export const insertSavedAddressSchema = createInsertSchema(savedAddresses).omit({ id: true, createdAt: true });
export const insertManagerContactSchema = createInsertSchema(managerContacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBonusTransactionSchema = createInsertSchema(bonusTransactions).omit({ id: true, createdAt: true });

export const insertDeliveryReasonsSchema = createInsertSchema(deliveryReasons).omit({ id: true, createdAt: true });
export const insertCourierDeliveriesSchema = createInsertSchema(courierDeliveries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderCancellationsSchema = createInsertSchema(orderCancellations).omit({ id: true, createdAt: true });
export const insertOrderItemsRemovedSchema = createInsertSchema(orderItemsRemoved).omit({ id: true, createdAt: true });
export const insertCourierApplicationSchema = createInsertSchema(courierApplications).omit({
  id: true,
  status: true,
  adminComment: true,
  reviewedById: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type OrderEvent = typeof orderEvents.$inferSelect;
export type InsertOrderEvent = z.infer<typeof insertOrderEventSchema>;

export type CourierSchedule = typeof courierSchedule.$inferSelect;
export type InsertCourierSchedule = z.infer<typeof insertCourierScheduleSchema>;

export type ShoppingCart = typeof shoppingCarts.$inferSelect;
export type InsertShoppingCart = z.infer<typeof insertShoppingCartSchema>;

export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;

export type SavedAddress = typeof savedAddresses.$inferSelect;
export type InsertSavedAddress = z.infer<typeof insertSavedAddressSchema>;

export type ManagerContact = typeof managerContacts.$inferSelect;
export type InsertManagerContact = z.infer<typeof insertManagerContactSchema>;

export type BonusTransaction = typeof bonusTransactions.$inferSelect;
export type InsertBonusTransaction = z.infer<typeof insertBonusTransactionSchema>;

export type CourierLocation = typeof courierLocations.$inferSelect;
export type InsertCourierLocation = z.infer<typeof insertCourierLocationSchema>;

export type DeliveryReason = typeof deliveryReasons.$inferSelect;
export type InsertDeliveryReason = z.infer<typeof insertDeliveryReasonsSchema>;

export type CourierDelivery = typeof courierDeliveries.$inferSelect;
export type InsertCourierDelivery = z.infer<typeof insertCourierDeliveriesSchema>;

export type OrderCancellation = typeof orderCancellations.$inferSelect;
export type InsertOrderCancellation = z.infer<typeof insertOrderCancellationsSchema>;

export type OrderItemRemoved = typeof orderItemsRemoved.$inferSelect;
export type InsertOrderItemRemoved = z.infer<typeof insertOrderItemsRemovedSchema>;

export type CourierApplication = typeof courierApplications.$inferSelect;
export type InsertCourierApplication = z.infer<typeof insertCourierApplicationSchema>;

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
  fullName: string;
  email: string | null;
  phone: string | null;
};

export type AdminUserListItem = Omit<User, "password">;

export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;

export type CreateOrderRequest = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  channel?: OrderChannel;
  items: { productId: number; quantity: number }[];
  useBonuses?: boolean;
};

export type OrderWithItems = Order & {
  items: (OrderItem & { product: Product })[];
};

export type CustomerOrderHistoryItem = OrderWithItems & {
  lastEvent?: OrderEvent;
};

export type CourierStats = {
  period: "day" | "week" | "month";
  completedDeliveries: number;
  activeDeliveries: number;
  cancelledDeliveries: number;
  successRate: number;
  averageDeliveryMinutes: number;
};

export type AnalyticsSummary = {
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
  topProducts: { name: string; quantity: number; revenue: number }[];
  salesByDate: { date: string; amount: number; orders: number }[];
  productCategories: { category: string; products: number; stock: number; stockValue: number }[];
  recentOrders: {
    id: number;
    createdAt: Date | string;
    customerName: string;
    status: OrderStatus;
    courierName: string | null;
    totalAmount: number;
  }[];
};
